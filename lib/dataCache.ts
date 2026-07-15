import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

// Stale-while-revalidate cache: screens render the last-known data instantly
// (memory first, disk on cold start) while a fresh fetch runs in the
// background and updates in place. Cleared on sign-out.

const memory = new Map<string, unknown>();
const PREFIX = 'stampd:cache:';

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
