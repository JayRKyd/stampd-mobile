import AsyncStorage from '@react-native-async-storage/async-storage';

// First-run walkthrough flags. The tour shows once for new users; Profile's
// "App tour" row sets the replay flag so Home runs it one more time.

const DONE_KEY = 'stampd:tour:v1:done';
const REPLAY_KEY = 'stampd:tour:replay';

export async function requestTourReplay(): Promise<void> {
  await AsyncStorage.setItem(REPLAY_KEY, '1');
}

/** True when the tour should run now (first run, or a queued replay). */
export async function consumeTourRequest(): Promise<boolean> {
  const [done, replay] = await Promise.all([
    AsyncStorage.getItem(DONE_KEY),
    AsyncStorage.getItem(REPLAY_KEY),
  ]);
  if (replay) {
    await AsyncStorage.removeItem(REPLAY_KEY);
    return true;
  }
  return !done;
}

export async function markTourDone(): Promise<void> {
  await AsyncStorage.setItem(DONE_KEY, '1');
}
