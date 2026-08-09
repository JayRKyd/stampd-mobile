import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// In-app review prompt. We call Google's native review flow at a genuine
// positive moment (a redeemed reward) at most once ever from our side —
// Google itself further throttles when/if the card actually appears.

const ASKED_KEY = 'stampd:review:asked:v1';

export async function maybeAskForReview(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    if (!(await StoreReview.hasAction())) return; // no store action available
    // Mark first so a slow/again call can't double-prompt across renders.
    await AsyncStorage.setItem(ASKED_KEY, '1');
    await StoreReview.requestReview();
  } catch {
    // Never let a review prompt failure surface to the user.
  }
}
