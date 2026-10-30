import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { revalidateCache } from '@/lib/dataCache';
import { GiftCard, saneCard, formatClaimInput, money } from '@/lib/giftCards';
import { takePendingGiftCode } from '@/lib/pendingGift';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';

// "Have a gift card?" Type the 8-character code from the slip or message.
// We show what it is before it's added, then one tap makes it yours.

const EXPLAIN: Record<string, string> = {
  not_found: "No gift card with that code. Check it against the slip and try again.",
  already_claimed: 'Someone has already added this card to their Stampd.',
  expired: 'This gift card has expired. Ask the shop that sold it.',
  void: 'The shop cancelled this gift card. Ask them at the counter.',
  unauthorized: 'Sign in to add a gift card.',
};

export default function ClaimGiftCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => formatClaimInput(params.code ?? ''));
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<GiftCard | null>(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  const complete = code.replace('-', '').length === 8;

  // A code that arrived by link before sign-in is waiting here; use it once
  useEffect(() => {
    takePendingGiftCode().then(pending => {
      if (pending && !params.code) setCode(formatClaimInput(pending));
    });
  }, [params.code]);

  // Look the code up as soon as it's complete
  useEffect(() => {
    if (!complete) { setFound(null); setError(''); return; }
    let alive = true;
    (async () => {
      setLooking(true);
      setError('');
      const { data, error: err } = await supabase.rpc('peek_gift_card', { p_code: code });
      if (!alive) return;
      setLooking(false);
      const res = data as any;
      if (err || !res) { setError('Could not check that code. Try again in a moment.'); return; }
      if (res.ok && saneCard(res.card)) { setFound(res.card); return; }
      if (res.error === 'already_yours' && res.card_id) {
        router.replace(`/gift/${res.card_id}`);
        return;
      }
      setError(EXPLAIN[res.error] ?? 'Could not check that code.');
    })();
    return () => { alive = false; };
  }, [code, complete, router]);

  async function claim() {
    if (!found || claiming) return;
    setClaiming(true);
    const { data, error: err } = await supabase.rpc('claim_gift_card', { p_code: code });
    const res = data as any;
    if (err || !res?.ok) {
      setClaiming(false);
      setError(EXPLAIN[res?.error] ?? 'Could not add the card. Try again.');
      return;
    }
    // The wallet, the shop's card page and Home all show the new balance
    revalidateCache('gift-cards', 'home', 'rewards');
    router.replace(`/gift/${res.card.id}`);
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/rewards'))} activeOpacity={0.8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={J.ink} />
        </TouchableOpacity>

        <Text style={s.title}>Have a gift card?</Text>
        <Text style={s.sub}>Type the code from the person who gave it to you. It's on the slip or in the message they sent.</Text>

        <Text style={s.label}>GIFT CARD CODE</Text>
        <TextInput
          style={s.input}
          value={code}
          onChangeText={t => setCode(formatClaimInput(t))}
          placeholder="XXXX-XXXX"
          placeholderTextColor={J.inkMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={!params.code}
          maxLength={9}
        />

        {looking && (
          <View style={s.lookRow}>
            <ActivityIndicator color={J.teal} />
            <Text style={s.lookText}>Checking…</Text>
          </View>
        )}

        {!!error && (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {found && (
          <View style={s.foundCard}>
            <Text style={s.foundLabel}>FOUND IT</Text>
            <View style={[s.card, { backgroundColor: found.card_color }]}>
              <View style={s.cardHead}>
                <View style={s.logo}>
                  {found.logo_url ? (
                    <Image source={{ uri: found.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
                  ) : (
                    <Text style={[s.logoInitials, { color: found.card_color }]}>{found.business_name.slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardName} numberOfLines={1}>{found.business_name}</Text>
                  <Text style={s.cardFrom} numberOfLines={1}>
                    {found.for_name ? `For ${found.for_name}` : 'Gift card'}{found.from_name ? ` · from ${found.from_name}` : ''}
                  </Text>
                </View>
                <View style={s.tag}><Text style={s.tagText}>GIFT CARD</Text></View>
              </View>
              <Text style={s.cardAmount}>{money(found.amount_cents)}</Text>
              {!!found.note && <Text style={s.cardNote}>“{found.note}”</Text>}
            </View>
            <Text style={s.foundBody}>
              Once it's yours, only you can spend it. Use it at {found.business_name}
              {found.expires_at ? ` any time before ${new Date(found.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[s.primary, (!found || claiming) && s.primaryOff]}
          onPress={claim}
          disabled={!found || claiming}
          activeOpacity={0.85}
        >
          <Text style={s.primaryText}>{claiming ? 'Adding…' : 'Add to my gift cards'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.6, marginTop: 28, marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 11, fontFamily: FontFamily.bold, color: J.inkSoft, letterSpacing: 0.9, marginBottom: 10 },
  input: {
    height: 60, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: J.teal,
    paddingHorizontal: 18, fontSize: 26, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: 4, textAlign: 'center',
  },
  lookRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  lookText: { fontSize: 13, fontFamily: FontFamily.medium, color: J.inkSoft },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, backgroundColor: 'rgba(220,38,38,0.08)', borderRadius: 12, padding: 12 },
  errorText: { flex: 1, fontSize: 13, fontFamily: FontFamily.medium, color: Colors.danger, lineHeight: 18 },
  foundCard: { marginTop: 24, backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  foundLabel: { fontSize: 11, fontFamily: FontFamily.bold, color: J.teal, letterSpacing: 0.9 },
  card: { borderRadius: 18, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 10, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 13, fontFamily: FontFamily.extrabold },
  cardName: { fontSize: 15, fontFamily: FontFamily.extrabold, color: '#fff' },
  cardFrom: { fontSize: 11, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.75)' },
  tag: { backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 9, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 1 },
  cardAmount: { fontSize: 34, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -1 },
  cardNote: { fontSize: 13, fontFamily: FontFamily.regular, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10, lineHeight: 18 },
  foundBody: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 19 },
  primary: { height: 54, borderRadius: 27, backgroundColor: J.teal, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },
});
