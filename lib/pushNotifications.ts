import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Foreground: the in-app LiveNotifications toast (driven by realtime) handles
// the on-screen moment, so suppress the OS banner to avoid showing both. The
// notification still lands in the tray/list for history. When the app is
// backgrounded, iOS shows the push normally — this handler doesn't run then.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

/** Register this device for merchant nudges and reward alerts. Safe to call on every login. */
export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return;

  // Android 8+ requires a channel or delivered pushes are silently dropped.
  // 'default' is what Expo's push service targets when no channelId is set.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Stamps & rewards',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00605A',
    }).catch(() => {});
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return;

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult.data;
  if (!token) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Remove any prior row for this token, then insert fresh (works without a unique index)
  await supabase.from('push_tokens').delete().eq('user_id', user.id).eq('token', token);
  await supabase.from('push_tokens').insert({ user_id: user.id, token, platform });
}
