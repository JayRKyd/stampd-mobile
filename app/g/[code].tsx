import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setPendingGiftCode } from '@/lib/pendingGift';
import { Palette as J } from '@/constants/theme';

// https://stampdbahamas.com/g/CODE opens here when the app is installed.
// Stash the code (in case they still have to sign in) and go to the claim
// screen; the root guard handles the signed-out case and comes back to it.

export default function GiftLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    const clean = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    (async () => {
      if (clean.length === 8) await setPendingGiftCode(clean);
      router.replace(clean.length === 8 ? { pathname: '/gift/claim', params: { code: clean } } : '/(tabs)/rewards');
    })();
  }, [code, router]);

  return (
    <View style={{ flex: 1, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={J.teal} />
    </View>
  );
}
