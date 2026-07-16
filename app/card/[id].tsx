import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { Colors, FontFamily, Palette as J, Radius, Spacing, Shadow } from '@/constants/theme';
import { getStampIcon } from '@/lib/stampIcons';
import { cardGradient, heroGradient } from '@/lib/cardColor';
import { StampCard } from '@/components/StampCard';

const { width } = Dimensions.get('window');

type RewardTier = {
  id: string;
  stamp_threshold: number;
  reward_title: string;
  sort_order: number;
};

type Membership = {
  id: string;
  current_stamps: number;
  total_stamps_earned: number;
  total_rewards_earned: number;
  last_stamp_at: string | null;
  created_at: string;
  merchants: { id: string; business_name: string; category: string; logo_url: string | null };
  loyalty_cards: {
    id: string;
    reward_description: string | null;
    stamp_count_required: number;
    reward_title: string;
    stamp_icon: string | null;
    card_color: string | null;
    visit_label: string | null;
    reward_tiers: RewardTier[];
  };
};

type StampEvent = {
  id: string;
  created_at: string;
  method: 'phone_number' | 'personal_pin' | 'generated_pin';
  stamp_number: number;
};

type Reward = {
  id: string;
  reward_title: string;
  status: 'pending' | 'redeemed' | 'expired';
  created_at: string;
  expires_at: string;
};

// ── PIN Modal ────────────────────────────────────────────────────────────────

function PinModal({
  visible, onClose, onSuccess, merchantName,
}: {
  visible: boolean; onClose: () => void; onSuccess: () => void; merchantName: string;
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() { setPin(''); setError(''); }
  function handleClose() { reset(); onClose(); }

  function numPress(k: string) {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return; }
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    setError('');
    if (next.length === 6) submitPin(next);
  }

  async function submitPin(code: string) {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase.rpc('redeem_generated_pin', { p_code: code, p_user_id: user.id });
    if (error || !data?.success) {
      setError(data?.error === 'invalid_or_expired_pin'
        ? 'Invalid or expired PIN. Ask the merchant to generate a new one.'
        : 'Something went wrong. Try again.');
      setPin('');
      setLoading(false);
      return;
    }
    setLoading(false);
    reset();
    onSuccess();
  }

  const cells = Array.from({ length: 6 }, (_, i) => pin[i] || '');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Enter Merchant PIN</Text>
          <Text style={s.modalSub}>Ask {merchantName} for their current PIN code</Text>
          <View style={s.cellRow}>
            {cells.map((d, i) => (
              <View key={i} style={[s.cell, d && s.cellFilled, pin.length === i && s.cellActive, error && s.cellError]}>
                {loading && i === 5 && pin.length === 6
                  ? <ActivityIndicator size="small" color={J.teal} />
                  : <Text style={s.cellText}>{d}</Text>}
              </View>
            ))}
          </View>
          {error ? <Text style={s.pinError}>{error}</Text> : null}
          <View style={s.numpad}>
            {keys.map((k, i) => (
              k === '' ? <View key={i} style={s.numKeyEmpty} /> :
              <TouchableOpacity key={i} style={[s.numKey, k === '⌫' && s.numKeyDel]}
                onPress={() => numPress(k)} disabled={loading} activeOpacity={0.7}>
                <Text style={[s.numKeyText, k === '⌫' && s.numKeyDelText]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Reward Modal ─────────────────────────────────────────────────────────────

function RewardModal({ visible, reward, merchantName, onClose }: {
  visible: boolean; reward: Reward | null; merchantName: string; onClose: () => void;
}) {
  if (!reward) return null;
  const expires = new Date(reward.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.modalSheet, { gap: Spacing.lg }]}>
          <View style={s.modalHandle} />
          <View style={s.rewardIconBox}>
            <Ionicons name="gift-outline" size={32} color={Colors.gold} />
          </View>
          <Text style={s.modalTitle}>You earned a reward!</Text>
          <Text style={s.modalSub}>Show this screen to {merchantName} to redeem</Text>
          <LinearGradient colors={[Colors.gold, Colors.goldDark]} style={s.voucherCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={s.voucherGloss} />
            <Text style={s.voucherFrom}>{merchantName}</Text>
            <Text style={s.voucherReward}>{reward.reward_title}</Text>
            <Text style={s.voucherExpiry}>Expires {expires}</Text>
          </LinearGradient>
          <TouchableOpacity style={s.doneBtn} onPress={onClose}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pinVisible, setPinVisible] = useState(false);
  const [rewardVisible, setRewardVisible] = useState(false);
  const [stampSuccess, setStampSuccess] = useState(false);

  // Cached like the tab screens: last-known card renders instantly (and
  // offline) while a fresh fetch runs. Fetcher returns null on failure so
  // stale data is kept rather than blanking the screen.
  const { data, isLoading, refresh } = useCachedData<{
    membership: Membership;
    events: StampEvent[];
    pendingReward: Reward | null;
  }>(`card-detail:${id}`, async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;

      const { data: m, error: mErr } = await supabase
        .from('memberships')
        .select(`id, current_stamps, total_stamps_earned, total_rewards_earned, last_stamp_at, created_at,
          merchants (id, business_name, category, logo_url),
          loyalty_cards (id, reward_description, stamp_count_required, reward_title, stamp_icon, card_color, visit_label)`)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (mErr || !m) return null;

      const loyaltyCardId = (m as any).loyalty_cards?.id;
      let tiers: RewardTier[] = [];
      if (loyaltyCardId) {
        const { data: tierData } = await supabase
          .from('reward_tiers')
          .select('id, stamp_threshold, reward_title, sort_order')
          .eq('loyalty_card_id', loyaltyCardId)
          .order('sort_order');
        tiers = tierData ?? [];
      }

      const [evRes, rwRes] = await Promise.all([
        supabase.from('stamp_events').select('id, created_at, method, stamp_number')
          .eq('membership_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('rewards').select('id, reward_title, status, created_at, expires_at')
          .eq('membership_id', id).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      return {
        membership: { ...m, loyalty_cards: { ...(m as any).loyalty_cards, reward_tiers: tiers } } as unknown as Membership,
        events: evRes.data ?? [],
        pendingReward: rwRes.data ?? null,
      };
    } catch {
      return null;
    }
  });

  const membership = data?.membership ?? null;
  const events = data?.events ?? [];
  const pendingReward = data?.pendingReward ?? null;

  function handleStampSuccess() {
    setPinVisible(false);
    setStampSuccess(true);
    refresh();
    setTimeout(() => setStampSuccess(false), 3000);
  }

  if (!membership) {
    return (
      <View style={s.loadingScreen}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <Text style={s.offlineText}>
              Can't load this card right now.{'\n'}Check your connection and try again.
            </Text>
            <TouchableOpacity style={s.offlineBtn} onPress={refresh} activeOpacity={0.8}>
              <Text style={s.offlineBtnText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.offlineBackText}>Go back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const { merchants, loyalty_cards, current_stamps } = membership;
  const totalRequired = loyalty_cards?.stamp_count_required ?? 10;
  const rewardTitle = loyalty_cards?.reward_title ?? '';
  const stampIcon = loyalty_cards?.stamp_icon ?? 'star';
  const memberSince = new Date(membership.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const gradientIndex = id ? id.charCodeAt(0) % Colors.cardGradients.length : 0;
  const gradient = cardGradient(loyalty_cards?.card_color, gradientIndex);
  const cardColor = gradient[0];
  const heroBg = heroGradient(cardColor);
  const EventStampIcon = getStampIcon(stampIcon);

  function methodLabel(m: StampEvent['method']) {
    if (m === 'phone_number') return 'Via phone number';
    if (m === 'personal_pin') return 'Via your PIN';
    return 'Via merchant PIN';
  }

  // Group events by date
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  const groupedEvents: { label: string; items: StampEvent[] }[] = [];
  events.forEach(ev => {
    const d = new Date(ev.created_at);
    const key = d.toDateString();
    const label = key === todayStr ? 'Today'
      : key === yesterdayStr ? 'Yesterday'
      : d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
    const existing = groupedEvents.find(g => g.label === label);
    if (existing) existing.items.push(ev);
    else groupedEvents.push({ label, items: [ev] });
  });

  return (
    <View style={[s.root, { backgroundColor: heroBg[1] }]}>

      {/* ── Hero gradient ──────────────────────────── */}
      <LinearGradient
        colors={heroBg}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[s.hero, { paddingTop: insets.top + 14 }]}
      >
        {/* Radial glow behind card — mimics the reference's center light */}
        <View style={[s.glowOrb, { backgroundColor: cardColor }]} />
        {/* Nav row */}
        <View style={s.nav}>
          <View style={{ width: 36 }} />
          <Text style={s.navTitle} numberOfLines={1}>{merchants.business_name}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        {/* Floating loyalty card — same shared card as the wallet */}
        <View style={s.floatingCardWrap}>
          <StampCard
            businessName={merchants.business_name}
            category={merchants.category}
            currentStamps={current_stamps}
            totalRequired={totalRequired}
            rewardTitle={rewardTitle}
            cardColor={loyalty_cards?.card_color}
            gradientIndex={gradientIndex}
            logoUrl={merchants.logo_url}
            stampIcon={stampIcon}
            visitLabel={loyalty_cards?.visit_label}
          />
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={s.action} onPress={() => setPinVisible(true)} activeOpacity={0.75}>
            <View style={s.actionCircle}>
              <Ionicons name="keypad-outline" size={22} color="#fff" />
            </View>
            <Text style={s.actionLabel}>Enter PIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.action}
            onPress={() => pendingReward && setRewardVisible(true)}
            activeOpacity={pendingReward ? 0.75 : 0.5}
          >
            <View style={[s.actionCircle, pendingReward && s.actionCircleGold]}>
              <Ionicons name="ribbon-outline" size={24} color={pendingReward ? Colors.gold : '#fff'} />
            </View>
            <Text style={[s.actionLabel, !pendingReward && { opacity: 0.5 }]}>
              {pendingReward ? 'Claim Now' : 'Reward'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.action}
            onPress={() => router.push(`/discover/${merchants.id}`)}
            activeOpacity={0.75}
          >
            <View style={s.actionCircle}>
              <Ionicons name="storefront-outline" size={22} color="#fff" />
            </View>
            <Text style={s.actionLabel}>Details</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── White bottom sheet ─────────────────────── */}
      <View style={s.sheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.sheetScroll, { paddingBottom: insets.bottom + 32 }]}>

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statCol}>
              <Text style={s.statNum}>{membership.total_stamps_earned}</Text>
              <Text style={s.statLabel}>Total{'\n'}Stamps</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCol}>
              <Text style={s.statNum}>{membership.total_rewards_earned}</Text>
              <Text style={s.statLabel}>Rewards{'\n'}Earned</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCol}>
              <Text style={[s.statNum, { fontSize: 13, letterSpacing: 0 }]}>{memberSince}</Text>
              <Text style={s.statLabel}>Member{'\n'}Since</Text>
            </View>
          </View>

          {/* Stamp success */}
          {stampSuccess && (
            <View style={s.successBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
              <Text style={s.successText}>Stamp added! Card updated.</Text>
            </View>
          )}

          {/* Stamp history */}
          {events.length === 0 ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIconBox}>
                <Ionicons name="time-outline" size={28} color={Colors.textMuted} />
              </View>
              <Text style={s.emptyTitle}>No stamps yet</Text>
              <Text style={s.emptyBody}>Your stamp history will appear here after your first visit</Text>
            </View>
          ) : groupedEvents.map(group => (
            <View key={group.label} style={s.group}>
              <Text style={s.groupLabel}>{group.label}</Text>
              {group.items.map(ev => {
                const d = new Date(ev.created_at);
                const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                return (
                  <View key={ev.id} style={s.eventRow}>
                    <View style={[s.eventIcon, { backgroundColor: `${cardColor}15` }]}>
                      <EventStampIcon size={18} strokeWidth={2} color={cardColor} />
                    </View>
                    <View style={s.eventBody}>
                      <Text style={s.eventTitle}>Stamp #{ev.stamp_number} earned</Text>
                      <Text style={s.eventSub}>{methodLabel(ev.method)} · {timeStr}</Text>
                    </View>
                    <Text style={[s.eventBadge, { color: cardColor }]}>+1</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      <PinModal visible={pinVisible} onClose={() => setPinVisible(false)}
        onSuccess={handleStampSuccess} merchantName={merchants.business_name} />
      <RewardModal visible={rewardVisible} reward={pendingReward}
        merchantName={merchants.business_name} onClose={() => setRewardVisible(false)} />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060f14' },
  loadingScreen: { flex: 1, backgroundColor: '#060f14', alignItems: 'center', justifyContent: 'center' },
  offlineText: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  offlineBtn: {
    height: 46,
    paddingHorizontal: 28,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  offlineBtnText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
  offlineBackText: { fontSize: 13, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.55)' },

  // Hero
  hero: { paddingHorizontal: 24, paddingBottom: 28, overflow: 'hidden' },
  glowOrb: {
    position: 'absolute',
    alignSelf: 'center',
    top: '15%',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.18,
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  navTitle: { fontSize: 16, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.9)', flex: 1, textAlign: 'center' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Floating card
  floatingCardWrap: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 18,
  },

  // Action buttons
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 28 },
  action: { alignItems: 'center', gap: 8 },
  actionCircle: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  actionCircleGold: {
    borderColor: 'rgba(212,168,67,0.6)',
  },
  actionLabel: { fontSize: 12, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.8)' },

  // Bottom sheet
  sheet: {
    flex: 1, backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -20,
  },
  sheetScroll: { paddingHorizontal: 24, paddingTop: 16 },

  // Stats
  statsRow: {
    flexDirection: 'row', paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    marginBottom: 24,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontFamily: FontFamily.medium, color: J.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.borderLight, alignSelf: 'stretch', marginVertical: 4 },

  // Success
  successBanner: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: Colors.successMuted, borderRadius: 12,
    padding: 14, marginBottom: 20,
  },
  successText: { fontSize: 13, fontFamily: FontFamily.semibold, color: Colors.success },

  // History groups
  group: { marginBottom: 28 },
  groupLabel: {
    fontSize: 13, fontFamily: FontFamily.semibold,
    color: Colors.textMuted, marginBottom: 4, letterSpacing: 0.2,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  eventIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  eventBody: { flex: 1 },
  eventTitle: { fontSize: 15, fontFamily: FontFamily.semibold, color: J.ink, marginBottom: 2 },
  eventSub: { fontSize: 12, fontFamily: FontFamily.regular, color: J.inkSoft },
  eventBadge: { fontSize: 17, fontFamily: FontFamily.extrabold },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIconBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontFamily: FontFamily.semibold, color: Colors.text },
  emptyBody: { fontSize: 13, fontFamily: FontFamily.regular, color: Colors.textMuted, textAlign: 'center', maxWidth: 240 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(13,27,42,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xxl, paddingBottom: 40, paddingTop: Spacing.lg,
    alignItems: 'center', gap: Spacing.md,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: Spacing.sm },
  modalTitle: { fontSize: 18, fontFamily: FontFamily.extrabold, color: Colors.text, letterSpacing: -0.3 },
  modalSub: { fontSize: 13, fontFamily: FontFamily.regular, color: Colors.textMuted, textAlign: 'center' },
  cellRow: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.sm },
  cell: {
    width: 44, height: 54, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSecondary, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  cellFilled: { borderColor: J.teal, backgroundColor: 'rgba(0,96,90,0.08)' },
  cellActive: { borderColor: J.teal, borderWidth: 2 },
  cellError: { borderColor: Colors.danger, backgroundColor: Colors.dangerMuted },
  cellText: { fontSize: 22, fontFamily: FontFamily.bold, color: Colors.text },
  pinError: { fontSize: 12, fontFamily: FontFamily.medium, color: Colors.danger, textAlign: 'center' },
  numpad: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: Spacing.sm, justifyContent: 'center' },
  numKey: {
    width: (width - Spacing.xxl * 2 - Spacing.sm * 2) / 3, height: 52,
    borderRadius: Radius.lg, backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  numKeyEmpty: { width: (width - Spacing.xxl * 2 - Spacing.sm * 2) / 3, height: 52 },
  numKeyDel: { backgroundColor: Colors.background },
  numKeyText: { fontSize: 20, fontFamily: FontFamily.bold, color: Colors.text },
  numKeyDelText: { fontSize: 16, color: Colors.textSecondary },
  cancelBtn: { marginTop: Spacing.sm, padding: Spacing.md },
  cancelText: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.textMuted },

  rewardIconBox: { width: 64, height: 64, borderRadius: Radius.xl, backgroundColor: 'rgba(212,168,67,0.12)', alignItems: 'center', justifyContent: 'center' },
  voucherCard: { width: '100%', borderRadius: Radius.xxl, padding: Spacing.xxl, overflow: 'hidden', ...Shadow.card },
  voucherGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.15)', borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl },
  voucherFrom: { fontSize: 12, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  voucherReward: { fontSize: 26, fontFamily: FontFamily.extrabold, color: '#fff', marginBottom: Spacing.sm, letterSpacing: -0.5 },
  voucherExpiry: { fontSize: 12, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.7)' },
  doneBtn: { width: '100%', backgroundColor: J.teal, borderRadius: 22, padding: Spacing.lg, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: '#fff' },
});
