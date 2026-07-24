import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { visitLabelWord } from '@/lib/visitLabel';
import { Colors, FontFamily, Palette as J, Radius, Spacing, Shadow } from '@/constants/theme';

type Reward = {
  id: string;
  reward_title: string;
  status: 'pending' | 'redeemed' | 'expired';
  created_at: string;
  expires_at: string;
  merchants: {
    business_name: string;
    category: string;
    loyalty_cards: { card_color: string | null }[];
  };
};

type NextUp = {
  business_name: string;
  reward_title: string;
  left: number;
  visit_label: string | null;
} | null;

const SCREEN_W = Dimensions.get('window').width;
// Narrower than the sheet so the next ticket peeks in — the visual cue that
// there's more to swipe
const TICKET_W = SCREEN_W - 64;
const TICKET_GAP = 12;

function brandOf(r: Reward): string {
  const color = r.merchants.loyalty_cards?.[0]?.card_color;
  return cardGradient(color, r.merchants.business_name.charCodeAt(0))[0];
}

function isLight(hex: string): boolean {
  const num = parseInt(hex.replace('#', ''), 16);
  const brightness = (0.299 * ((num >> 16) & 0xff) + 0.587 * ((num >> 8) & 0xff) + 0.114 * (num & 0xff)) / 255;
  return brightness > 0.45;
}

function VoucherModal({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  if (!reward) return null;
  const expires = new Date(reward.expires_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  // Same ticket anatomy as the list, in reward gold. Gold is a light brand,
  // so text follows the adaptive rule: darkened gold, not white.
  const goldText = shadeColor(Colors.gold, 0.45);

  return (
    <Modal visible={!!reward} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
          <View style={s.handle} />
          <View style={s.sheetIconBox}>
            <Ionicons name="gift-outline" size={28} color={Colors.gold} />
          </View>
          <Text style={s.sheetTitle}>Show this to redeem</Text>
          <Text style={s.sheetSub}>{reward.merchants.business_name}</Text>

          <View style={[s.ticket, { backgroundColor: Colors.gold, width: '100%', marginBottom: 0 }]}>
            <View style={s.ticketMain}>
              <Text style={[s.ticketFrom, { color: goldText, opacity: 0.75 }]} numberOfLines={1}>
                {reward.merchants.business_name.toUpperCase()}
              </Text>
              <Text style={[s.ticketTitle, { color: goldText }]} numberOfLines={2}>{reward.reward_title}</Text>
              <Text style={[s.ticketExpiry, { color: goldText, opacity: 0.7 }]}>Expires {expires}</Text>
            </View>
            <View style={s.perfRow}>
              <View style={[s.notch, { left: -9, backgroundColor: '#fff' }]} />
              <View style={[s.dash, { borderTopColor: 'rgba(0,0,0,0.25)' }]} />
              <View style={[s.notch, { right: -9, backgroundColor: '#fff' }]} />
            </View>
            <View style={s.ticketStub}>
              <Ionicons name="gift" size={15} color={goldText} />
              <Text style={[s.ticketStubText, { color: goldText }]}>
                Staff will mark it redeemed at the counter
              </Text>
            </View>
          </View>

          <TouchableOpacity style={s.doneBtn} onPress={onClose}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function RewardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Reward | null>(null);
  const [ticketIndex, setTicketIndex] = useState(0);

  const onTicketScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (TICKET_W + TICKET_GAP));
    if (idx !== ticketIndex) setTicketIndex(idx);
  };

  const { data: rwData, isLoading: loading } = useCachedData('rewards', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: rw }, { data: ms }] = await Promise.all([
      supabase
        .from('rewards')
        .select(`id, reward_title, status, created_at, expires_at, merchants (business_name, category, loyalty_cards (card_color))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('memberships')
        .select(`current_stamps, merchants (business_name), loyalty_cards (stamp_count_required, reward_title, visit_label)`)
        .eq('user_id', user.id),
    ]);

    const all = ((rw as any) ?? []) as Reward[];

    // Closest incomplete card, for the empty-state nudge
    const candidates = ((ms as any) ?? [])
      .map((m: any) => {
        const required = m.loyalty_cards?.stamp_count_required ?? 10;
        return {
          business_name: m.merchants?.business_name ?? '',
          reward_title: m.loyalty_cards?.reward_title ?? 'a reward',
          left: required - m.current_stamps,
          visit_label: m.loyalty_cards?.visit_label ?? null,
        };
      })
      .filter((c: any) => c.left > 0)
      .sort((a: any, b: any) => a.left - b.left);

    return {
      rewards: all.filter(r => r.status === 'pending'),
      history: all.filter(r => r.status !== 'pending'),
      nextUp: (candidates[0] ?? null) as NextUp,
    };
  });

  const rewards = rwData?.rewards ?? [];
  const history = rwData?.history ?? [];
  const nextUp = rwData?.nextUp ?? null;

  const pendingCount = rewards.length;

  return (
    <View style={s.root}>
      {/* Teal header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerEyebrow}>Your earned rewards</Text>
            <Text style={s.headerTitle}>Rewards</Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="trophy" size={20} color={Colors.gold} />
          </View>
        </View>

        {/* Stat card, matching the home header */}
        <View style={s.statCard}>
          <View style={s.statTop}>
            <Ionicons name="gift" size={21} color={J.giftRed} />
            <Text style={s.statNum}>{pendingCount}</Text>
          </View>
          <Text style={s.statLabel}>Ready to redeem</Text>
        </View>
      </View>

      {/* Cream sheet */}
      <View style={s.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        >
          <Text style={s.sectionLabel}>READY TO REDEEM</Text>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={J.teal} />
            </View>
          ) : rewards.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="gift-outline" size={28} color={J.teal} />
              </View>
              <Text style={s.emptyTitle}>No rewards yet</Text>
              <Text style={s.emptyBody}>
                {nextUp
                  ? `You're ${nextUp.left} ${visitLabelWord(nextUp.visit_label, nextUp.left)} away from ${nextUp.reward_title} at ${nextUp.business_name}.`
                  : 'Complete a stamp card to unlock your first reward.'}
              </Text>
              <TouchableOpacity
                style={s.emptyButton}
                onPress={() => router.navigate('/my-cards')}
                activeOpacity={0.8}
              >
                <Text style={s.emptyButtonText}>View your cards</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (() => {
            const renderTicket = (r: Reward, extraStyle?: object) => {
              const expires = new Date(r.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const brand = brandOf(r);
              const light = isLight(brand);
              const textColor = light ? shadeColor(brand, 0.3) : '#fff';
              const dashColor = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)';
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setSelected(r)}
                  activeOpacity={0.9}
                  style={[s.ticket, { backgroundColor: brand }, extraStyle]}
                >
                  {/* Main section */}
                  <View style={s.ticketMain}>
                    <Text style={[s.ticketFrom, { color: textColor, opacity: 0.75 }]} numberOfLines={1}>
                      {r.merchants.business_name.toUpperCase()}
                    </Text>
                    <Text style={[s.ticketTitle, { color: textColor }]} numberOfLines={2}>{r.reward_title}</Text>
                    <Text style={[s.ticketExpiry, { color: textColor, opacity: 0.65 }]}>Expires {expires}</Text>
                  </View>

                  {/* Perforation with side notches */}
                  <View style={s.perfRow}>
                    <View style={[s.notch, { left: -9 }]} />
                    <View style={[s.dash, { borderTopColor: dashColor }]} />
                    <View style={[s.notch, { right: -9 }]} />
                  </View>

                  {/* Redeem stub */}
                  <View style={s.ticketStub}>
                    <Ionicons name="gift" size={15} color={light ? Colors.goldDark : Colors.gold} />
                    <Text style={[s.ticketStubText, { color: textColor }]}>Tap to redeem</Text>
                    <Ionicons name="chevron-forward" size={14} color={textColor} style={{ opacity: 0.7 }} />
                  </View>
                </TouchableOpacity>
              );
            };

            if (rewards.length === 1) return renderTicket(rewards[0]);

            // Multiple tickets: swipe between them, next one peeking in
            return (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={TICKET_W + TICKET_GAP}
                  snapToAlignment="start"
                  onScroll={onTicketScroll}
                  scrollEventThrottle={16}
                  style={s.ticketScroll}
                  contentContainerStyle={s.ticketScrollContent}
                >
                  {rewards.map(r => renderTicket(r, { width: TICKET_W, marginBottom: 0 }))}
                </ScrollView>
                <View style={s.dotsRow}>
                  {rewards.map((_, i) => (
                    <View key={i} style={[s.dot, i === ticketIndex && s.dotActive]} />
                  ))}
                </View>
              </>
            );
          })()}

          {/* Cards stay reachable once rewards fill this page */}
          {!loading && rewards.length > 0 && (
            <TouchableOpacity
              style={s.cardsLinkRow}
              onPress={() => router.navigate('/my-cards')}
              activeOpacity={0.8}
            >
              <View style={s.cardsLinkIcon}>
                <Ionicons name="albums-outline" size={17} color={J.teal} />
              </View>
              <Text style={s.cardsLinkText}>View your cards</Text>
              <Ionicons name="chevron-forward" size={15} color={J.inkSoft} />
            </TouchableOpacity>
          )}

          {/* How it works — for people who haven't earned a reward yet.
              Once they have, they know; History takes this spot instead. */}
          {rewards.length === 0 && history.length === 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: Spacing.xxl }]}>HOW IT WORKS</Text>
              <View style={s.stepsCard}>
                {[
                  { label: 'Show your PIN', desc: 'Give the cashier your member PIN when you pay.' },
                  { label: 'Fill your card', desc: 'Each visit earns a stamp toward the reward.' },
                  { label: 'Redeem', desc: 'Card full? Show your reward at the counter.' },
                ].map((step, i, arr) => (
                  <View key={step.label}>
                    <View style={s.step}>
                      <Text style={s.stepNum}>{`0${i + 1}`}</Text>
                      <View style={s.stepBody}>
                        <Text style={s.stepLabel}>{step.label}</Text>
                        <Text style={s.stepDesc}>{step.desc}</Text>
                      </View>
                    </View>
                    {i < arr.length - 1 && <View style={s.stepDivider} />}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* History */}
          {history.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: Spacing.xxl }]}>HISTORY</Text>
              <View style={s.historyCard}>
                {history.map((r, i) => {
                  const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <View key={r.id}>
                      {i > 0 && <View style={s.historyDivider} />}
                      <View style={s.historyRow}>
                        <View style={s.historyIcon}>
                          <Ionicons
                            name={r.status === 'redeemed' ? 'checkmark-circle-outline' : 'time-outline'}
                            size={20}
                            color={r.status === 'redeemed' ? Colors.success : Colors.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.historyName}>{r.reward_title}</Text>
                          <Text style={s.historyBiz}>{r.merchants.business_name}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.historyStatus, r.status === 'redeemed' ? s.statusRedeemed : s.statusExpired]}>
                            {r.status === 'redeemed' ? 'Redeemed' : 'Expired'}
                          </Text>
                          <Text style={s.historyDate}>{date}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      <VoucherModal reward={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },

  // Header
  header: { backgroundColor: J.teal, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  headerEyebrow: { fontSize: 12, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.6, lineHeight: 34 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statNum: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.3 },
  statLabel: { fontSize: 12, fontFamily: FontFamily.medium, color: J.inkSoft },

  // Sheet
  sheet: {
    flex: 1, backgroundColor: J.cream,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 18, overflow: 'hidden',
  },
  content: { paddingHorizontal: 20 },
  loadingWrap: { paddingVertical: Spacing.xxxl, alignItems: 'center' },
  sectionLabel: {
    fontSize: 11, fontFamily: FontFamily.semibold, color: J.inkSoft,
    letterSpacing: 0.8, marginBottom: Spacing.md, textTransform: 'uppercase',
  },

  // Empty state
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 28, alignItems: 'center', ...Shadow.sm,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(0,96,90,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,96,90,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg,
  },
  emptyTitle: { fontSize: 17, fontFamily: FontFamily.extrabold, color: J.ink, marginBottom: Spacing.sm },
  emptyBody: {
    fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft,
    textAlign: 'center', lineHeight: 19, maxWidth: 260, marginBottom: 18,
  },
  emptyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: J.teal, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 22,
  },
  emptyButtonText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },

  // Ticket voucher
  ticket: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    ...Shadow.md,
  },
  ticketMain: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  ticketFrom: {
    fontSize: 11, fontFamily: FontFamily.bold,
    letterSpacing: 1, marginBottom: 4,
  },
  ticketTitle: {
    fontSize: 22, fontFamily: FontFamily.extrabold,
    letterSpacing: -0.4, lineHeight: 27, marginBottom: 4,
  },
  ticketExpiry: { fontSize: 12, fontFamily: FontFamily.medium },
  perfRow: {
    height: 18, justifyContent: 'center', flexDirection: 'row', alignItems: 'center',
  },
  notch: {
    position: 'absolute', top: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: J.cream,
  },
  dash: {
    flex: 1, height: 1,
    borderTopWidth: 1.5, borderStyle: 'dashed',
    marginHorizontal: 18,
  },
  ticketStub: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14,
  },
  ticketStubText: { fontSize: 13, fontFamily: FontFamily.bold, flex: 1 },

  // Ticket carousel (2+ pending rewards)
  ticketScroll: { marginHorizontal: -20 },
  ticketScrollContent: { paddingHorizontal: 20, gap: TICKET_GAP },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    marginTop: 12, marginBottom: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(26,43,42,0.18)' },
  dotActive: { backgroundColor: J.teal, width: 16 },

  // Quiet route back to the wallet when tickets fill the page
  cardsLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 13, paddingHorizontal: 16,
    marginTop: 2, ...Shadow.sm,
  },
  cardsLinkIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(0,96,90,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardsLinkText: { flex: 1, fontSize: 14, fontFamily: FontFamily.semibold, color: J.ink },

  // Steps — editorial numerals, no icon chips
  stepsCard: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20, ...Shadow.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 18, gap: 16 },
  stepNum: {
    fontSize: 15, fontFamily: FontFamily.extrabold,
    color: 'rgba(0,96,90,0.35)', letterSpacing: 0.5,
    width: 26, lineHeight: 21,
  },
  stepBody: { flex: 1 },
  stepLabel: { fontSize: 15, fontFamily: FontFamily.semibold, color: J.ink, marginBottom: 3, letterSpacing: -0.2 },
  stepDesc: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 19 },
  stepDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 42 },

  // History
  historyCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', ...Shadow.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  historyDivider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: Spacing.lg },
  historyIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: J.cream,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  historyName: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.ink, marginBottom: 2 },
  historyBiz: { fontSize: 11, fontFamily: FontFamily.regular, color: J.inkSoft },
  historyStatus: { fontSize: 11, fontFamily: FontFamily.bold, marginBottom: 2 },
  statusRedeemed: { color: Colors.success },
  statusExpired: { color: Colors.textMuted },
  historyDate: { fontSize: 11, fontFamily: FontFamily.regular, color: J.inkSoft },

  // Redeem modal
  overlay: { flex: 1, backgroundColor: 'rgba(13,27,42,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xxl, paddingBottom: 40, paddingTop: Spacing.lg,
    alignItems: 'center', gap: Spacing.lg,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  sheetIconBox: {
    width: 60, height: 60, borderRadius: Radius.xl,
    backgroundColor: 'rgba(212,168,67,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontSize: 20, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.3 },
  sheetSub: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft },
  doneBtn: { width: '100%', backgroundColor: J.teal, borderRadius: 22, padding: Spacing.lg, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: '#fff' },
});
