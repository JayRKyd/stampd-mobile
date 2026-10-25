import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Which island the customer is looking at. One choice, saved on their
// profile and mirrored here so every screen reads it synchronously.
// Discover, the Today board and the launch push are scoped to it; cards,
// rewards and history never are.

export type IslandId = 'grand-bahama' | 'nassau';

export const ISLANDS: { id: IslandId; name: string }[] = [
  { id: 'grand-bahama', name: 'Grand Bahama' },
  { id: 'nassau', name: 'Nassau' },
];

export const DEFAULT_ISLAND: IslandId = 'grand-bahama';
const STORAGE_KEY = 'stampd:island';

let current: IslandId = DEFAULT_ISLAND;
let lastLocalSet = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function isIslandId(v: unknown): v is IslandId {
  return ISLANDS.some(i => i.id === v);
}

/** Display name; anything unknown (old cache, null) reads as Grand Bahama. */
export function islandName(id: string | null | undefined): string {
  return ISLANDS.find(i => i.id === id)?.name ?? 'Grand Bahama';
}

// Hydrate from disk on launch so the first paint already shows the right island
AsyncStorage.getItem(STORAGE_KEY)
  .then(v => {
    if (isIslandId(v) && v !== current && Date.now() - lastLocalSet > 10_000) {
      current = v;
      emit();
    }
  })
  .catch(() => {});

/**
 * A profile fetch said this is the user's island. It wins unless they just
 * changed it on this device (the write may still be in flight).
 */
export function syncIslandFromServer(v: unknown) {
  if (!isIslandId(v) || v === current) return;
  if (Date.now() - lastLocalSet < 10_000) return;
  current = v;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, v).catch(() => {});
}

/** The user picked an island. Screens update at once; the profile follows. */
export async function setIsland(v: IslandId) {
  if (v === current) return;
  current = v;
  lastLocalSet = Date.now();
  emit();
  AsyncStorage.setItem(STORAGE_KEY, v).catch(() => {});
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ island: v }).eq('id', user.id);
  } catch {
    // offline: the local choice stands and the next profile sync reconciles
  }
}

export function useIsland() {
  const island = useSyncExternalStore(
    sub => { listeners.add(sub); return () => { listeners.delete(sub); }; },
    () => current,
    () => current,
  );
  return { island, islandName: islandName(island), setIsland };
}
