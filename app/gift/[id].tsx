import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { GiftCard, GiftEvent, saneCard, money, giftCodeDisplay, shareGiftCard } from '@/lib/giftCards';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

// One gift card: the balance, what's happened on it, and the button that
// shows the counter code. The buyer sees the same screen for a card they
// sent, with Share instead of the code.

function CodeModal({ card, visible, onClose }: { card: GiftCard; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [error, setError] = useState('');

  const fetchCode = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('gift_card_code', { p_card_id: card.id });
    const res = data as any;
    if (err || !res?.ok || typeof res.code !== 'string') {
      setError(res?.error === 'used' ? 'This card has been used up.' : 'Could not get a code. Check your connection.');
      return;
    }
    setError('');
    setCode(res.code);
    setSecondsLeft(Math.max(1, Number(res.seconds_left) || 60));
  }, [card.id]);

  // New code every minute while the sheet is open
  useEffect(() => {
    if (!visible) return;
    setCode(null);
    fetchCode();
    const tick = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { fetchCode(); return 60; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [visible, fetchCode]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={[s.modalTop, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={s.close} onPress={onClose} activeOpacity={0.8} accessibilityLabel="Close">
            <Ionicons name="close" size={18} color={J.ink} />
          </TouchableOpacity>
          <View style={s.modalLogo}>
            {card.logo_url ? (
              <Image source={{ uri: card.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
            ) : (
              <Text style={[s.logoInitials, { color: card.card_color }]}>{card.business_name.slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.modalShop} numberOfLines={1}>{card.business_name} gift card</Text>
            <Text style={s.modalBal}>Balance {money(card.balance_cents)}</Text>
          </View>
        </View>

        <View style={s.modalCenter}>
          <View style={s.codeCard}>
            <Text style={s.codeLabel}>GIFT CARD CODE</Text>
            {code ? (
              <Text style={s.code}>{giftCodeDisplay(code)}</Text>
            ) : error ? (
              <Text style={s.codeError}>{error}</Text>
            ) : (
              <ActivityIndicator color={J.teal} style={{ marginVertical: 18 }} />
            )}
            {code && (
              <>
                <View style={s.timerBar}>
                  <View style={[s.timerFill, { width: `${(secondsLeft / 60) * 100}%` }]} />
                </View>
                <Text style={s.timerText}>New code in {secondsLeft}s</Text>
              </>
            )}
            <View style={s.codeDivider} />
            <Text style={s.codeHelp}>Show this at the counter. Staff type the code and the amount, and your balance updates here.</Text>
          </View>
          <View style={s.onlyPill}>
            <View style={s.onlyDot} />
            <Text style={s.onlyText}>Only works at {card.business_name} · one minute per code</Text>
          </View>
        </View>

        <TouchableOpacity style={[s.doneBtn, { marginBottom: insets.bottom + 20 }]} onPress={onClose} activeOpacity={0.85}>
          <Text style={s.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function GiftCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [codeOpen, setCodeOpen] = useState(false);

  const { data, isLoading } = useCachedData<{ card: GiftCard; events: GiftEvent[] }>(`gift:${id}`, async () => {
    const { data, error } = await supabase.rpc('gift_card_detail', { p_card_id: id });
    const res = data as any;
    if (error || !res || !saneCard(res.card)) return null;
    return { card: res.card, events: Array.isArray(res.events) ? res.events : [] };
  });

  const card = data && saneCard(data.card) ? data.card : null;
  const events = Array.isArray(data?.events) ? data!.events : [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/rewards'));

  if (!card) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={[s.backBtn, { marginLeft: 20 }]} onPress={back} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={J.ink} />
        </TouchableOpacity>
        <View style={s.center}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.missing}>This gift card isn't yours to see.</Text>}
        </View>
      </View>
    );
  }

  const mine = card.is_mine;
  const used = card.status === 'used';
  const voided = card.status === 'void';
  const usedPct = card.amount_cents > 0 ? Math.round(((card.amount_cents - card.balance_cents) / card.amount_cents) * 100) : 0;
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eyebrow = mine
    ? (card.from_name ? `FROM ${card.from_name.toUpperCase()}` : 'YOUR GIFT CARD')
    : (card.for_name ? `FOR ${card.for_name.toUpperCase()}` : 'SENT BY YOU');

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={back} activeOpacity={0.8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={J.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle}>Gift card</Text>
          <Text style={s.headerSub} numberOfLines={1}>{eyebrow}</Text>
        </View>
      </View>

      <ScrollView style={s.sheet} contentContainerStyle={[s.sheetContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {/* the card */}
        <View style={[s.card, { backgroundColor: card.card_color }, (used || voided) && { opacity: 0.6 }]}>
          <View style={s.cardHead}>
            <View style={s.logo}>
              {card.logo_url ? (
                <Image source={{ uri: card.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
              ) : (
                <Text style={[s.logoInitials, { color: card.card_color }]}>{card.business_name.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.cardName} numberOfLines={1}>{card.business_name}</Text>
              <Text style={s.cardFrom} numberOfLines={1}>
                {card.for_name ? `For ${card.for_name}` : 'Gift card'}{card.from_name ? ` · from ${card.from_name}` : ''}
              </Text>
            </View>
            <View style={s.tag}><Text style={s.tagText}>{voided ? 'CANCELLED' : used ? 'USED' : 'GIFT CARD'}</Text></View>
          </View>
          <View style={s.amountRow}>
            <Text style={s.amount}>{money(card.balance_cents)}</Text>
            <Text style={s.amountSub}>{card.balance_cents === card.amount_cents ? 'balance' : `left of ${money(card.amount_cents)}`}</Text>
          </View>
          {card.balance_cents !== card.amount_cents && (
            <View style={s.barWrap}>
              <View style={s.bar}><View style={[s.barFill, { width: `${usedPct}%` }]} /></View>
              <Text style={s.barText}>{money(card.amount_cents - card.balance_cents)} used</Text>
            </View>
          )}
          {!!card.note && <Text style={s.note}>“{card.note}”{card.from_name ? <Text style={s.noteFrom}> — {card.from_name}</Text> : null}</Text>}
        </View>

        {/* meta */}
        <View style={s.metaRow}>
          <View style={s.metaTile}>
            <Text style={s.metaLabel}>{card.status === 'unclaimed' ? 'STATUS' : 'EXPIRES'}</Text>
            <Text style={s.metaValue}>
              {card.status === 'unclaimed' ? 'Not claimed yet'
                : card.expires_at ? new Date(card.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
            </Text>
          </View>
          <View style={s.metaTile}>
            <Text style={s.metaLabel}>USE IT AT</Text>
            <Text style={s.metaValue} numberOfLines={1}>{card.business_name} only</Text>
          </View>
        </View>

        {/* sender's view of an unclaimed card */}
        {!mine && card.status === 'unclaimed' && card.claim_code && (
          <View style={s.sentBox}>
            <Text style={s.sentLabel}>THEIR CODE</Text>
            <Text style={s.sentCode}>{card.claim_code}</Text>
            <Text style={s.sentBody}>Send this to {card.for_name ?? 'them'}. They type it under Rewards in Stampd, or tap the link if they don't have the app yet.</Text>
            <TouchableOpacity style={s.shareBtn} onPress={() => shareGiftCard(card)} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={s.shareText}>Share</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* history */}
        {events.length > 0 && (
          <>
            <Text style={s.sectionLabel}>HISTORY</Text>
            <View style={s.history}>
              {events.map((e, i) => {
                const label = e.type === 'redeem' ? `Used at ${card.business_name}`
                  : e.type === 'issue' ? (card.from_name ? `Gift from ${card.from_name}` : `Issued at ${card.business_name}`)
                  : e.type === 'claim' ? 'Added to Stampd'
                  : 'Cancelled by the shop';
                const amt = e.type === 'redeem' && e.amount_cents != null ? `−${money(Math.abs(e.amount_cents))}`
                  : e.type === 'issue' && e.amount_cents != null ? `+${money(e.amount_cents)}` : '';
                return (
                  <View key={e.id} style={[s.histRow, i > 0 && s.histBorder]}>
                    <View style={[s.histIcon, e.type === 'issue' && s.histIconGold]}>
                      <Ionicons
                        name={e.type === 'redeem' ? 'arrow-down' : e.type === 'issue' ? 'gift' : e.type === 'claim' ? 'checkmark' : 'close'}
                        size={16}
                        color={e.type === 'issue' ? Colors.goldDark : J.teal}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.histTitle}>{label}</Text>
                      <Text style={s.histSub}>{when(e.created_at)}{e.staff_name ? ` · ${e.staff_name} at the counter` : ''}</Text>
                    </View>
                    {!!amt && <Text style={[s.histAmt, e.type === 'issue' && { color: J.teal }]}>{amt}</Text>}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {mine && card.status === 'active' && (
          <TouchableOpacity style={s.primary} onPress={() => setCodeOpen(true)} activeOpacity={0.85}>
            <Ionicons name="key-outline" size={18} color="#fff" />
            <Text style={s.primaryText}>Show code to redeem</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <CodeModal card={card} visible={codeOpen} onClose={() => setCodeOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { fontSize: 14, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.8)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 18 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.4 },
  headerSub: { fontSize: 11, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8, marginTop: 2 },
  sheet: { flex: 1, backgroundColor: J.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { padding: 20, gap: 14 },

  card: { borderRadius: 22, padding: 20, gap: 16, ...Shadow.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 15, fontFamily: FontFamily.extrabold },
  cardName: { fontSize: 17, fontFamily: FontFamily.extrabold, color: '#fff' },
  cardFrom: { fontSize: 12, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.7)' },
  tag: { backgroundColor: Colors.gold, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  tagText: { fontSize: 10, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amount: { fontSize: 44, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -1.5, lineHeight: 48 },
  amountSub: { fontSize: 13, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.7)' },
  barWrap: { gap: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  barText: { fontSize: 11, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.7)' },
  note: { fontSize: 14, fontFamily: FontFamily.regular, fontStyle: 'italic', color: '#fff', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, lineHeight: 20 },
  noteFrom: { fontStyle: 'normal', fontFamily: FontFamily.bold },

  metaRow: { flexDirection: 'row', gap: 10 },
  metaTile: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  metaLabel: { fontSize: 10, fontFamily: FontFamily.bold, color: J.inkSoft, letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontFamily: FontFamily.extrabold, color: J.ink },

  sentBox: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(0,96,90,0.3)' },
  sentLabel: { fontSize: 11, fontFamily: FontFamily.bold, color: J.teal, letterSpacing: 0.9 },
  sentCode: { fontSize: 30, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: 3 },
  sentBody: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 19 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: J.teal, height: 46, borderRadius: 23, marginTop: 4 },
  shareText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },

  sectionLabel: { fontSize: 11, fontFamily: FontFamily.semibold, color: J.inkSoft, letterSpacing: 0.8, marginTop: 6 },
  history: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  histBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  histIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,96,90,0.1)', alignItems: 'center', justifyContent: 'center' },
  histIconGold: { backgroundColor: 'rgba(212,168,67,0.18)' },
  histTitle: { fontSize: 14, fontFamily: FontFamily.bold, color: J.ink },
  histSub: { fontSize: 12, fontFamily: FontFamily.regular, color: J.inkSoft, marginTop: 1 },
  histAmt: { fontSize: 15, fontFamily: FontFamily.extrabold, color: J.ink },

  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 27, backgroundColor: J.teal, marginTop: 6 },
  primaryText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },

  // code sheet
  modalRoot: { flex: 1, backgroundColor: '#06251F', paddingHorizontal: 20 },
  modalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  modalLogo: { width: 34, height: 34, borderRadius: 10, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  modalShop: { fontSize: 15, fontFamily: FontFamily.extrabold, color: J.cream },
  modalBal: { fontSize: 11, fontFamily: FontFamily.medium, color: 'rgba(247,242,232,0.7)' },
  modalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  codeCard: { width: '100%', backgroundColor: J.cream, borderRadius: 28, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', gap: 14, ...Shadow.md },
  codeLabel: { fontSize: 11, fontFamily: FontFamily.bold, color: J.teal, letterSpacing: 1.2 },
  code: { fontSize: 46, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 4, lineHeight: 52 },
  codeError: { fontSize: 14, fontFamily: FontFamily.medium, color: Colors.danger, textAlign: 'center', paddingVertical: 12 },
  timerBar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(0,96,90,0.15)', overflow: 'hidden' },
  timerFill: { height: 6, borderRadius: 3, backgroundColor: J.teal },
  timerText: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.inkSoft },
  codeDivider: { width: '100%', height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  codeHelp: { fontSize: 14, fontFamily: FontFamily.regular, color: J.ink, textAlign: 'center', lineHeight: 20 },
  onlyPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,242,232,0.1)', borderWidth: 1.5, borderColor: 'rgba(247,242,232,0.16)', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  onlyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  onlyText: { fontSize: 13, fontFamily: FontFamily.semibold, color: 'rgba(247,242,232,0.85)' },
  doneBtn: { height: 52, borderRadius: 26, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontFamily: FontFamily.extrabold, color: '#0C2E29' },
});
