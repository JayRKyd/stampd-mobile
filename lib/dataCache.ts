import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

// Stale-while-revalidate cache: screens render the last-known data instantly
// (memory first, disk on cold start) while a fresh fetch runs in the
// background and updates in place. Cleared on sign-out.

const memory = new Map<string, unknown>();
const PREFIX = 'stampd:cache:';

// Live refetchers: every mounted useCachedData registers its refresh under
// its key, so an out-of-band event (e.g. a realtime stamp) can force any
// on-screen data to reload in place via revalidateCache().
const refreshers = new Map<string, Set<() => void>>();

/** Force any mounted screens using these keys to refetch immediately. */
export function revalidateCache(...keys: string[]) {
  for (const key of keys) {
    memory.delete(key); // drop stale so a fresh consumer doesn't read it
    refreshers.get(key)?.forEach(fn => fn());
  }
}

export function useCachedData<T>(key: string, fetcher: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(() => (memory.get(key) as T) ?? null);
  const [isLoading, setIsLoading] = useState(!memory.has(key));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const fresh = await fetcherRef.current();
    if (fresh == null) {
      if (aliveRef.current) setIsLoading(false);
      return;
    }
    memory.set(key, fresh);
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(fresh)).catch(() => {});
    if (aliveRef.current) {
      setData(fresh);
      setIsLoading(false);
    }
  }, [key]);

  // Register this instance's refresh so revalidateCache(key) can reach it,
  // even when the screen is mounted but not focused (e.g. behind a tab).
  useEffect(() => {
    let set = refreshers.get(key);
    if (!set) { set = new Set(); refreshers.set(key, set); }
    set.add(refresh);
    return () => {
      set!.delete(refresh);
      if (set!.size === 0) refreshers.delete(key);
    };
  }, [key, refresh]);

  useFocusEffect(useCallback(() => {
    aliveRef.current = true;

    // Cold start: hydrate from disk while the network round-trip runs
    if (!memory.has(key)) {
      AsyncStorage.getItem(PREFIX + key).then(raw => {
        if (!aliveRef.current || raw == null || memory.has(key)) return;
        try {
          const parsed = JSON.parse(raw) as T;
          memory.set(key, parsed);
          setData(parsed);
          setIsLoading(false);
        } catch {
          // corrupt cache entry — ignore, network refresh will replace it
        }
      });
    }

    refresh();
    return () => { aliveRef.current = false; };
  }, [key, refresh]));

  return { data, isLoading, refresh };
}

/** Wipe everything — call on sign-out so the next user never sees stale data. */
export function clearDataCache() {
  memory.clear();
  AsyncStorage.getAllKeys()
    .then(keys => AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX))))
    .catch(() => {});
}
