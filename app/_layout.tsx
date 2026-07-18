import { useEffect, useState, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { StatusBar } from 'expo-status-bar';
import { Linking, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { createSessionFromAuthUrl, isAuthCallbackUrl } from '@/lib/authDeepLink';
import { registerPushToken } from '@/lib/pushNotifications';
import { profileNamesComplete } from '@/lib/ensureProfile';
import { clearDataCache } from '@/lib/dataCache';
import { LiveNotifications } from '@/components/LiveNotifications';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

// Same guarded pattern as the web dashboard: no-ops entirely if no DSN is
// configured, so local dev never reports and beta builds do once the env
// var is set. tracesSampleRate matches web (0.1) for consistent sampling.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
  });
}

function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [booted, setBooted] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    const handleAuthUrl = async (url: string | null) => {
      if (!url || !isAuthCallbackUrl(url)) return;
      try {
        await createSessionFromAuthUrl(url);
        router.replace('/(tabs)');
      } catch {
        router.replace({
          pathname: '/(auth)/login',
          params: { authError: 'That verification link is invalid or has expired. Please try signing in again.' },
        });
      }
    };

    Linking.getInitialURL().then(handleAuthUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthUrl(url);
    });
    return () => subscription.remove();
  }, [router]);

  const refreshProfile = useCallback(async (userId: string) => {
    const ready = await profileNamesComplete(userId);
    setProfileReady(ready);
    return ready;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setSessionLoaded(true);
      if (s?.user?.id) refreshProfile(s.user.id);
      else setProfileReady(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user?.id) {
        refreshProfile(s.user.id);
        Sentry.setUser({ id: s.user.id }); // id only — no email/PII in crash reports
      } else {
        setProfileReady(null);
        clearDataCache(); // never show the previous user's data
        Sentry.setUser(null);
      }
      if (s) registerPushToken().catch(() => {});
    });
    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  useEffect(() => {
    if (session) registerPushToken().catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) refreshProfile(session.user.id);
  }, [session?.user?.id, segments.join('/'), refreshProfile]);

  useEffect(() => {
    if (!fontsLoaded || !sessionLoaded) return;
    if (session && profileReady === null) return;

    SplashScreen.hideAsync();

    const inAuth = segments[0] === '(auth)';
    const onCompleteProfile = (segments as string[]).includes('complete-profile');

    if (!session) {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    if (!profileReady) {
      if (!onCompleteProfile) router.replace('/(auth)/complete-profile');
      return;
    }

    if (inAuth) router.replace('/(tabs)');
  }, [session, sessionLoaded, fontsLoaded, profileReady, segments]);

  // Boot gate: hold a blank view only until the FIRST full ready state.
  // After that, keep the navigator mounted through sign-in/out transitions —
  // unmounting it resets navigation to the initial route, which is what
  // caused the welcome screen to flash after signing in.
  const ready = fontsLoaded && sessionLoaded && !(session && profileReady === null);
  useEffect(() => {
    if (ready && !booted) setBooted(true);
  }, [ready, booted]);

  if (!booted)
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      {/* Live in-app toast for stamps/rewards, over every screen while signed in */}
      <LiveNotifications userId={session?.user?.id} />
    </SafeAreaProvider>
  );
}

// Sentry.wrap adds root-level error boundary + navigation breadcrumbs.
// A no-op wrapper if Sentry was never initialized (no DSN).
export default Sentry.wrap(RootLayout);
