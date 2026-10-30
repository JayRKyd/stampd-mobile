import AsyncStorage from '@react-native-async-storage/async-storage';

// A gift card code that arrived by link before the person was signed in.
// Stashed here, picked up right after sign-in or sign-up, so the link still
// lands them on the claim screen with the code filled in.

const KEY = 'stampd:pendingGiftCode';

export async function setPendingGiftCode(code: string) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (clean.length !== 8) return;
  await AsyncStorage.setItem(KEY, clean).catch(() => {});
}

export async function takePendingGiftCode(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) await AsyncStorage.removeItem(KEY);
    return v && v.length === 8 ? v : null;
  } catch {
    return null;
  }
}

export async function peekPendingGiftCode(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v && v.length === 8 ? v : null;
  } catch {
    return null;
  }
}
