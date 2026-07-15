import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Clipboard,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { firstName as displayFirstName } from '@/lib/displayName';
import { Colors, FontFamily, Palette, Radius, Shadow } from '@/constants/theme';
import { StampCard } from '@/components/StampCard';
import { PinCard } from '@/components/PinCard';

const SCREEN_W = Dimensions.get('window').width;
const HERO_W = SCREEN_W - 40;
const HERO_GAP = 12;

const J = Palette;

type Membership = {
  id: string;
  current_stamps: number;
  total_stamps_earned?: number;
  total_rewards_earned?: number;
  last_stamp_at: string | null;
  merchants: { id: string; business_name: string; category: string; logo_url: string | null };
  loyalty_cards: { stamp_count_required: number; reward_title: string; stamp_icon: string | null; card_color: string | null; visit_label: string | null } | null;
};

type Profile = {
  first_name: string | null;
  last_name: string | null;
  personal_pin: string | null;
  created_at: string | null;
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isPinMasked, setIsPinMasked] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);
  const [view, setView] = useState<'shops' | 'cards'>('shops');
  const heroScrollRef = useRef<ScrollView>(null);

  const copyPinToClipboard = (pin: string) => {
    if (!pin) return;
    Clipboard.setString(pin);
    setToastMsg('PIN copied to clipboard');
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  };

  const { data: homeData } = useCachedData('home', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: prof }, { data: ms }] = await Promise.all([
      supabase.from('users').select('first_name, last_name, personal_pin, created_at').eq('id', user.id).single(),
      supabase
        .from('memberships')
        .select(`id, current_stamps, total_stamps_earned, total_rewards_earned, last_stamp_at, merchants (id, business_name, category, logo_url), loyalty_cards (stamp_count_required, reward_title, stamp_icon, card_color, visit_label)`)
        .eq('user_id', user.id)
        .order('last_stamp_at', { ascending: false }),
    ]);

    return {
      profile: prof as Profile,
      memberships: ((ms as any) ?? []) as Membership[],
    };
  });

  const profile = homeData?.profile ?? null;
  const memberships = homeData?.memberships ?? [];

  const greeting = displayFirstName(profile);
  const rawPin = profile?.personal_pin ?? '';
  const pinDisplay = rawPin
    ? isPinMasked
      ? '••• •••'
      : `${rawPin.slice(0, 3)} ${rawPin.slice(3)}`
    : '--- ---';
  const holderName = [profile?.first_name, profile?.last_name]
    .filter(Boolean).join(' ') || 'Stampd Member';
  const memberSinceShort = profile?.created_at
    ? (() => {
        const d = new Date(profile.created_at!);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
      })()
    : '—';

  const totalStamps = memberships.reduce((sum, m) => sum + (m.total_stamps_earned ?? 0), 0);
  const rewardsEarned = memberships.reduce((sum, m) => sum + (m.total_rewards_earned ?? 0), 0);

  // Hero carousel: incomplete cards sorted by progress; falls back to
  // complete cards ("claim it") so the carousel is never empty when cards exist.
  const incomplete = [...memberships]
    .filter(m => m.current_stamps < (m.loyalty_cards?.stamp_count_required ?? 10))
    .sort((a, b) => {
      const aReq = a.loyalty_cards?.stamp_count_required ?? 10;
      const bReq = b.loyalty_cards?.stamp_count_required ?? 10;
      return (b.current_stamps / bReq) - (a.current_stamps / aReq);
    });
  const heroCards = incomplete.length > 0 ? incomplete : memberships;

  // Get Started steps (Joyn-style onboarding ladder). Completed steps drop
  // out of the carousel; every card shows overall progress as n/4.
  const anyCardComplete = rewardsEarned > 0 ||
    memberships.some(m => m.current_stamps >= (m.loyalty_cards?.stamp_count_required ?? 10));
  const steps: {
    key: string;
    overline: string;
    title: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    done: boolean;
    onPress: () => void;
  }[] = [
    {
      key: 'first-stamp',
      overline: 'Unlock Rewards',
      title: 'Earn your first stamp',
      icon: 'gift',
      iconColor: J.giftRed,
      done: totalStamps > 0,
      onPress: () => router.push('/(tabs)/discover'),
    },
    {
      key: 'collect-five',
      overline: 'Keep Collecting',
      title: 'Collect 5 stamps',
      icon: 'star',
      iconColor: Colors.gold,
      done: totalStamps >= 5,
      onPress: () => setView('cards'),
    },
    {
      key: 'fill-card',
      overline: 'Almost There',
      title: 'Fill a full stamp card',
      icon: 'card',
      iconColor: J.teal,
      done: anyCardComplete,
      onPress: () => setView('cards'),
    },
    {
      key: 'redeem',
      overline: 'Sweet Rewards',
      title: 'Redeem your free reward',
      icon: 'trophy',
      iconColor: J.amber,
      done: rewardsEarned > 0,
      onPress: () => router.push('/(tabs)/rewards'),
    },
  ];
  const completedSteps = steps.filter(st => st.done).length;
  const pendingSteps = steps.filter(st => !st.done);
  const stepPct = Math.max(6, Math.round((completedSteps / steps.length) * 100));
  const heroCount = heroCards.length + pendingSteps.length;

  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (HERO_W + HERO_GAP));
    if (idx !== heroIndex) setHeroIndex(idx);
  };

  return (
    <View style={s.root}>
        {/* ===== Teal header ===== */}
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          {/* Location badge — static until multi-island launch */}
          <View style={s.locationChip}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={s.locationText}>Grand Bahama</Text>
          </View>

          {/* Greeting row */}
          <View style={s.heyRow}>
            <Text style={s.hey}>Hey {greeting}</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="menu" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Stat cards */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <View style={s.statTop}>
                <Ionicons name="gift" size={21} color={J.giftRed} />
                <Text style={s.statNum}>{rewardsEarned}</Text>
              </View>
              <Text style={s.statLabel}>Rewards</Text>
            </View>
            <View style={s.statCard}>
              <View style={s.statTop}>
                <View style={s.amberDot} />
                <Text style={s.statNum}>{totalStamps}</Text>
              </View>
              <Text style={s.statLabel}>Stamps</Text>
            </View>
          </View>

          {/* Section header */}
          <View style={s.gsRow}>
            <Text style={s.gsTitle}>{pendingSteps.length > 0 ? 'Get Started' : 'Keep Going'}</Text>
            <TouchableOpacity
              style={s.gsLink}
              activeOpacity={0.7}
              onPress={() => {
                if (pendingSteps.length > 0) {
                  heroScrollRef.current?.scrollTo({ x: heroCards.length * (HERO_W + HERO_GAP), animated: true });
                } else {
                  router.push('/my-cards');
                }
              }}
            >
              <Text style={s.gsLinkText}>{pendingSteps.length > 0 ? 'View all steps' : 'View all cards'}</Text>
              <Ionicons name="chevron-forward" size={13} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Hero carousel: card progress slides, then Get Started steps */}
          <ScrollView
            ref={heroScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={HERO_W + HERO_GAP}
            snapToAlignment="start"
            bounces={false}
            overScrollMode="never"
            onScroll={onHeroScroll}
            scrollEventThrottle={16}
            style={s.heroScroll}
            contentContainerStyle={s.heroScrollContent}
          >
            {heroCards.map((m) => {
                const required = m.loyalty_cards?.stamp_count_required ?? 10;
                const collected = Math.min(m.current_stamps, required);
                const complete = collected >= required;
                const pct = Math.max(6, Math.round((collected / required) * 100));
                return (
                  <TouchableOpacity
                    key={m.id}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/card/${m.id}`)}
                    style={[s.heroCard, { width: HERO_W }]}
                  >
                    <View style={s.heroLeft}>
                      <Text style={s.heroOverline} numberOfLines={1}>{m.merchants.business_name}</Text>
                      <View style={s.heroTitleRow}>
                        <Text style={s.heroTitle} numberOfLines={2}>
                          {complete ? `Claim your ${m.loyalty_cards?.reward_title ?? 'reward'}` : (m.loyalty_cards?.reward_title ?? 'Free reward')}
                        </Text>
                        <Ionicons name="chevron-forward" size={15} color="#fff" />
                      </View>
                      <View style={s.heroBarRow}>
                        <View style={s.heroBarTrack}>
                          <View style={[s.heroBarFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={s.heroFraction}>{collected}/{required}</Text>
                      </View>
                    </View>
                    <View style={s.heroTileWrap}>
                      <View style={s.heroTile}>
                        {m.merchants.logo_url ? (
                          <Image source={{ uri: m.merchants.logo_url }} style={s.heroTileImg} contentFit="contain" transition={150} cachePolicy="memory-disk" />
                        ) : (
                          <Text style={s.heroTileInitials}>
                            {m.merchants.business_name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="sparkles" size={15} color={J.creamBar} style={s.heroSparkle} />
                    </View>
                  </TouchableOpacity>
                );
              })}

            {pendingSteps.map((st) => (
              <TouchableOpacity
                key={st.key}
                activeOpacity={0.9}
                onPress={st.onPress}
                style={[s.heroCard, { width: HERO_W }]}
              >
                <View style={s.heroLeft}>
                  <Text style={s.heroOverline} numberOfLines={1}>{st.overline}</Text>
                  <View style={s.heroTitleRow}>
                    <Text style={s.heroTitle} numberOfLines={2}>{st.title}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#fff" />
                  </View>
                  <View style={s.heroBarRow}>
                    <View style={s.heroBarTrack}>
                      <View style={[s.heroBarFill, { width: `${stepPct}%` }]} />
                    </View>
                    <Text style={s.heroFraction}>{completedSteps}/{steps.length}</Text>
                  </View>
                </View>
                <View style={s.heroTileWrap}>
                  <View style={s.heroTile}>
                    <Ionicons name={st.icon} size={30} color={st.iconColor} />
                  </View>
                  <Ionicons name="sparkles" size={15} color={J.creamBar} style={s.heroSparkle} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pagination dots */}
          <View style={s.dotsRow}>
            {Array.from({ length: Math.max(1, Math.min(heroCount, 5)) }).map((_, i) => (
              <View key={i} style={[s.dot, i === Math.min(heroIndex, 4) && s.dotActive]} />
            ))}
          </View>
        </View>

        {/* ===== Cream sheet ===== */}
        <View style={s.sheet}>
          {/* PIN / Cards toggle */}
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.togglePill, view === 'shops' && s.togglePillActive]}
              onPress={() => setView('shops')}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, view === 'shops' && s.toggleTextActive]}>PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.togglePill, view === 'cards' && s.togglePillActive]}
              onPress={() => setView('cards')}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, view === 'cards' && s.toggleTextActive]}>Cards</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          >
          {view === 'shops' ? (
            <>
              {/* Promo banner — photo bleeds to the right edge, green panel
                  meets it with a convex curve (Joyn silhouette) */}
              <View style={s.bannerShadow}>
                <TouchableOpacity
                  style={s.banner}
                  activeOpacity={0.9}
                  onPress={() => router.push('/(tabs)/discover')}
                >
                  <View style={s.bannerTextWrap}>
                    <Text style={s.bannerText}>Shop and earn rewards, treats, and free stuff from local spots!</Text>
                  </View>
                  <View style={s.bannerImageWrap}>
                    <Image
                      source={require('../../assets/banner.jpg')}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                    />
                    {/* Curved seam: photo bows outward into the green, apex sits low */}
                    <Svg
                      width={26}
                      height="100%"
                      viewBox="0 0 26 100"
                      preserveAspectRatio="none"
                      style={s.bannerCurve}
                      pointerEvents="none"
                    >
                      <Path d="M0 0 L 26 0 C 8 30, 2 80, 26 100 L 0 100 Z" fill={J.bannerGreen} />
                    </Svg>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Banner dot */}
              <View style={s.bannerDotRow}>
                <View style={s.bannerDot} />
              </View>

              {/* Member PIN — the card */}
              <PinCard
                pinDisplay={pinDisplay}
                holderName={holderName}
                memberSince={memberSinceShort}
                masked={isPinMasked}
                onToggleMask={() => setIsPinMasked(!isPinMasked)}
                onPress={() => copyPinToClipboard(rawPin)}
              />
              <View style={s.pinFooterRow}>
                <Text style={s.pinFooterHint}>Tap card to copy · Show when you pay</Text>
                <TouchableOpacity
                  style={s.historyLink}
                  onPress={() => router.push('/history')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={13} color={J.teal} />
                  <Text style={s.historyLinkText}>History</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {memberships.length === 0 ? (
                <View style={s.emptyCards}>
                  <View style={s.emptyIconBox}>
                    <Ionicons name="card-outline" size={28} color={J.teal} />
                  </View>
                  <Text style={s.emptyTitle}>No cards yet</Text>
                  <Text style={s.emptyBody}>
                    Show your PIN to the cashier when you pay — your first stamp adds their card here automatically.
                  </Text>
                  <TouchableOpacity
                    style={s.emptyButton}
                    onPress={() => router.push('/(tabs)/discover')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.emptyButtonText}>Browse places on Stampd</Text>
                    <Ionicons name="arrow-forward" size={15} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.cardsList}>
                  {memberships.map((m, i) => (
                    <StampCard
                      key={m.id}
                      businessName={m.merchants.business_name}
                      category={m.merchants.category}
                      currentStamps={m.current_stamps}
                      totalRequired={m.loyalty_cards?.stamp_count_required ?? 10}
                      rewardTitle={m.loyalty_cards?.reward_title ?? ''}
                      cardColor={m.loyalty_cards?.card_color}
                      gradientIndex={i}
                      logoUrl={m.merchants.logo_url}
                      stampIcon={m.loyalty_cards?.stamp_icon}
                      visitLabel={m.loyalty_cards?.visit_label}
                      onPress={() => router.push(`/card/${m.id}`)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
          </ScrollView>
        </View>

      {toastVisible && (
        <View style={s.toastContainer}>
          <Ionicons name="checkmark-circle" size={15} color="#fff" />
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },

  // ===== Header =====
  header: { paddingHorizontal: 20, paddingBottom: 22 },

  locationChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },
  locationText: { fontSize: 13, fontFamily: FontFamily.semibold, color: '#fff' },

  heyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  hey: { fontSize: 26, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.5 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statNum: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.3 },
  statLabel: { fontSize: 12, fontFamily: FontFamily.medium, color: J.inkSoft },
  amberDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: J.amber },

  gsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gsTitle: { fontSize: 17, fontFamily: FontFamily.bold, color: '#fff', letterSpacing: -0.2 },
  gsLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  gsLinkText: { fontSize: 13, fontFamily: FontFamily.semibold, color: '#fff' },

  heroScroll: { marginHorizontal: -20 },
  heroScrollContent: { paddingHorizontal: 20, gap: HERO_GAP },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: J.tealDeep,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  heroLeft: { flex: 1, paddingRight: 12 },
  heroOverline: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 4,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: '#fff',
    lineHeight: 22,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  heroBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  heroBarTrack: {
    width: 120,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  heroBarFill: { height: 5, borderRadius: 3, backgroundColor: J.creamBar },
  heroFraction: { fontSize: 11, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.8)' },
  heroTileWrap: { position: 'relative' },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroTileImg: { width: '100%', height: '100%' },
  heroTileInitials: { fontSize: 20, fontFamily: FontFamily.extrabold, color: J.tealDeep },
  heroSparkle: { position: 'absolute', top: -8, right: -6 },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#fff' },

  // ===== Sheet =====
  sheet: {
    flex: 1,
    backgroundColor: J.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    overflow: 'hidden',
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  togglePill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillActive: { backgroundColor: J.teal },
  toggleText: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.ink },
  toggleTextActive: { color: '#fff', fontFamily: FontFamily.bold },

  bannerShadow: {
    borderRadius: 16,
    marginBottom: 10,
    ...Shadow.md,
  },
  banner: {
    flexDirection: 'row',
    height: 88,
    backgroundColor: J.bannerGreen,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  bannerTextWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: '#fff',
    lineHeight: 18,
  },
  bannerImageWrap: {
    width: '42%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bannerCurve: {
    position: 'absolute',
    left: -1,
    top: 0,
    bottom: 0,
  },

  bannerDotRow: { height: 24, justifyContent: 'center', marginBottom: 18 },
  bannerDot: {
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: J.ink,
    opacity: 0.85,
  },
  pinFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  pinFooterHint: { fontSize: 12, fontFamily: FontFamily.medium, color: J.inkSoft },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyLinkText: { fontSize: 12, fontFamily: FontFamily.bold, color: J.teal },

  cardsList: { gap: 14 },

  emptyCards: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    ...Shadow.sm,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(0,96,90,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,96,90,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontFamily: FontFamily.extrabold, color: J.ink, marginBottom: 6 },
  emptyBody: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
    marginBottom: 18,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: J.teal,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyButtonText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },

  toastContainer: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(22, 36, 40, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
    ...Shadow.md,
  },
  toastText: { color: '#fff', fontSize: 12, fontFamily: FontFamily.semibold },
});
