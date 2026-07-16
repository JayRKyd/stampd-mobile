import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { Colors, FontFamily, Palette as J, Spacing, Shadow } from '@/constants/theme';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { visitLabelWord } from '@/lib/visitLabel';
import { StampCard } from '@/components/StampCard';

type Merchant = {
  id: string;
  business_name: string;
  category: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  merchant_type: 'business' | 'individual' | null;
  trade: string | null;
  workplace: string | null;
};

type LoyaltyCard = {
  id: string;
  stamp_count_required: number;
  reward_title: string;
  reward_description: string | null;
  card_color: string | null;
  stamp_icon: string | null;
  visit_label: string | null;
};

type Membership = {
  id: string;
  current_stamps: number;
  total_stamps_earned: number;
  total_rewards_earned: number;
};

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Cached like the tab screens: a previously-viewed merchant renders
  // instantly (and offline) while a fresh fetch runs in the background.
  // The fetcher returns null on any network failure so stale data is kept.
  const { data, isLoading, refresh } = useCachedData<{
    unavailable: 'not_found' | 'inactive' | null;
    merchant: Merchant | null;
    card: LoyaltyCard | null;
    membership: Membership | null;
  }>(`merchant:${id}`, async () => {
    try {
      // getSession reads local storage — getUser() is a network call and
      // hanging on it offline is what stranded this screen on a spinner
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;

      // select('*') so cover_image_url is picked up automatically once the
      // column exists, without erroring while it doesn't
      const { data: m, error: mErr } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (mErr) return null;
      if (!m) return { unavailable: 'not_found' as const, merchant: null, card: null, membership: null };
      if (!m.is_active) return { unavailable: 'inactive' as const, merchant: null, card: null, membership: null };

      const merchant: Merchant = {
        id: m.id,
        business_name: m.business_name,
        category: m.category,
        description: m.description ?? null,
        phone: m.phone ?? null,
        address: m.address ?? null,
        logo_url: m.logo_url ?? null,
        cover_image_url: (m as any).cover_image_url ?? null,
        merchant_type: m.merchant_type ?? null,
        trade: m.trade ?? null,
        workplace: m.workplace ?? null,
      };

      const { data: lc, error: lcErr } = await supabase
        .from('loyalty_cards')
        .select('id, stamp_count_required, reward_title, reward_description, card_color, stamp_icon, visit_label')
        .eq('merchant_id', id)
        .eq('is_active', true)
        .maybeSingle();
      if (lcErr) return null;

      const { data: ms, error: msErr } = await supabase
        .from('memberships')
        .select('id, current_stamps, total_stamps_earned, total_rewards_earned')
        .eq('user_id', user.id)
        .eq('merchant_id', id)
        .maybeSingle();
      if (msErr) return null;

      return { unavailable: null, merchant, card: lc ?? null, membership: ms ?? null };
    } catch {
      return null;
    }
  });

  const merchant = data?.merchant ?? null;
  const unavailableReason = data?.unavailable ?? null;
  const card = data?.card ?? null;
  const membership = data?.membership ?? null;

  if (!data) {
    return (
      <View style={s.loadingScreen}>
        {isLoading ? (
          <ActivityIndicator color={J.teal} size="large" />
        ) : (
          <>
            <Text style={s.errorText}>
              Can't load this business right now.{'\n'}Check your connection and try again.
            </Text>
            <TouchableOpacity style={s.backLinkBtn} onPress={refresh}>
              <Ionicons name="refresh" size={16} color={J.teal} />
              <Text style={s.backLink}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.backLinkBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={16} color={J.teal} />
              <Text style={s.backLink}>Go back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  if (unavailableReason || !merchant || !card) {
    return (
      <View style={s.loadingScreen}>
        <Text style={s.errorText}>
          {unavailableReason === 'inactive'
            ? 'This business is not available yet'
            : 'Business not found'}
        </Text>
        <TouchableOpacity style={s.backLinkBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={J.teal} />
          <Text style={s.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isMember = !!membership;
  const label = visitLabelWord(card.visit_label, card.stamp_count_required);
  const brand = cardGradient(card.card_color, id ? id.charCodeAt(0) : 0)[0];
  const brandDark = shadeColor(brand, 0.42);

  const isIndividual = merchant.merchant_type === 'individual';
  const firstName = merchant.business_name.split(' ')[0];
  // Merchants sometimes type the "@" themselves — strip it before display/geocoding
  const workplace = merchant.workplace?.replace(/^@\s*/, '') ?? null;
  const categoryLabel = isIndividual && merchant.category === 'Other' ? 'Independent Pro' : merchant.category;
  // Pros often have no formal address — the workplace name geocodes fine
  const mapsQuery = merchant.address || (isIndividual ? workplace : null);
  const locationLine = isIndividual
    ? (workplace ? `Works at ${workplace}` : merchant.address)
    : merchant.address;

  function openCall() {
    if (merchant?.phone) Linking.openURL(`tel:${merchant.phone.replace(/[^+\d]/g, '')}`);
  }
  function openDirections() {
    if (mapsQuery) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`);
    }
  }

  return (
    <View style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* ── Cover ─────────────────────────────────── */}
        <View style={s.cover}>
          {/* Brand gradient always paints first — the photo fades in over it,
              so a slow image shows brand color instead of a white void */}
          <LinearGradient
            colors={[brand, brandDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.coverImg}
          >
            {!merchant.cover_image_url && (
              <Ionicons name={isIndividual ? 'person' : 'storefront'} size={72} color="rgba(255,255,255,0.14)" style={s.coverWatermark} />
            )}
          </LinearGradient>
          {merchant.cover_image_url ? (
            <Image
              source={{ uri: merchant.cover_image_url }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={250}
              cachePolicy="memory-disk"
            />
          ) : null}
          {/* Soft scrim so the back button always reads */}
          <LinearGradient
            colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
            style={s.coverScrim}
            pointerEvents="none"
          />
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.coverBack, { top: insets.top + 8 }]}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color={J.ink} />
          </TouchableOpacity>
        </View>

        {/* ── Identity ──────────────────────────────── */}
        <View style={s.content}>
          <View style={[s.logoTile, isIndividual && s.logoTileRound]}>
            {merchant.logo_url ? (
              <Image source={{ uri: merchant.logo_url }} style={s.logoImg} contentFit={isIndividual ? 'cover' : 'contain'} transition={150} cachePolicy="memory-disk" />
            ) : (
              <Text style={[s.logoInitials, { color: brandDark }]}>
                {merchant.business_name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
              </Text>
            )}
          </View>

          <Text style={s.name}>{merchant.business_name}</Text>
          <View style={s.metaRow}>
            <Text style={s.metaCategory}>{categoryLabel}</Text>
            {locationLine ? (
              <>
                <View style={s.metaDot} />
                <Ionicons name="location-outline" size={12} color={J.inkSoft} />
                <Text style={s.metaAddress} numberOfLines={1}>{locationLine}</Text>
              </>
            ) : null}
          </View>

          {merchant.description ? (
            <Text style={s.description}>{merchant.description}</Text>
          ) : null}

          {/* Contact actions */}
          {(merchant.phone || mapsQuery) && (
            <View style={s.actionRow}>
              {merchant.phone ? (
                <TouchableOpacity style={s.callBtn} onPress={openCall} activeOpacity={0.85}>
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={s.callBtnText}>Call</Text>
                </TouchableOpacity>
              ) : null}
              {mapsQuery ? (
                <TouchableOpacity style={s.directionsBtn} onPress={openDirections} activeOpacity={0.85}>
                  <Ionicons name="navigate-outline" size={16} color={J.ink} />
                  <Text style={s.directionsBtnText}>Directions</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* ── Membership / Join ─────────────────────── */}
          {isMember ? (
            <>
              {/* The live card is the progress display */}
              <View style={s.stampCardWrap}>
                <StampCard
                  businessName={merchant.business_name}
                  category={merchant.category}
                  currentStamps={membership!.current_stamps}
                  totalRequired={card.stamp_count_required}
                  rewardTitle={card.reward_title}
                  cardColor={card.card_color}
                  gradientIndex={id ? id.charCodeAt(0) : 0}
                  logoUrl={merchant.logo_url}
                  stampIcon={card.stamp_icon}
                  visitLabel={card.visit_label}
                  onPress={() => router.push(`/card/${membership!.id}`)}
                />
                {card.reward_description ? (
                  <Text style={s.rewardFootnote}>{card.reward_description}</Text>
                ) : null}
              </View>

              <View style={s.card}>
                <View style={s.progressTop}>
                  <View style={s.memberBadge}>
                    <Ionicons name="checkmark" size={12} color={Colors.success} />
                    <Text style={s.memberText}>You're a member</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`/card/${membership!.id}`)}
                    style={s.viewCardBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={s.viewCardText}>View Card</Text>
                    <Ionicons name="chevron-forward" size={14} color={J.teal} />
                  </TouchableOpacity>
                </View>
                <View style={s.statsRow}>
                  <View style={s.stat}>
                    <Text style={s.statValue}>{membership!.total_stamps_earned}</Text>
                    <Text style={s.statLabel}>TOTAL STAMPS</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.stat}>
                    <Text style={s.statValue}>{membership!.total_rewards_earned}</Text>
                    <Text style={s.statLabel}>REWARDS EARNED</Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={s.card}>
                <Text style={s.joinTitle}>
                  Earn {card.reward_title} {isIndividual ? `with ${firstName}` : 'here'}
                </Text>
                <Text style={s.joinDesc}>
                  {isIndividual
                    ? `Show your Stampd PIN when you pay ${firstName}. Your first stamp joins you automatically — ${card.stamp_count_required} ${label} fills your card.`
                    : `Show your Stampd PIN to the cashier when you pay. Your first stamp joins you automatically — ${card.stamp_count_required} ${label} fills your card.`}
                </Text>

                {/* Deal pills, same language as Discover */}
                <View style={s.dealRow}>
                  <View style={s.earnPill}>
                    <Text style={s.earnPillText}>
                      1 {(card.visit_label ?? 'stamp').toLowerCase() === 'stamp' ? 'visit' : visitLabelWord(card.visit_label, 1)} = 1 stamp
                    </Text>
                  </View>
                  <View style={s.rewardPill}>
                    <Text style={s.rewardPillText}>{card.stamp_count_required} = </Text>
                    <Ionicons name="gift" size={12} color={Colors.goldDark} />
                    <Text style={s.rewardPillText} numberOfLines={1}> {card.reward_title}</Text>
                  </View>
                </View>

                <TouchableOpacity onPress={() => router.push('/(tabs)/')} activeOpacity={0.85} style={s.joinBtn}>
                  <Ionicons name="key-outline" size={18} color="#fff" />
                  <Text style={s.joinBtnText}>Show my PIN</Text>
                </TouchableOpacity>
              </View>

              {/* Preview of the card they'd be collecting on */}
              <View style={s.stampCardWrap}>
                <Text style={s.previewLabel}>THE CARD</Text>
                <StampCard
                  businessName={merchant.business_name}
                  category={merchant.category}
                  currentStamps={0}
                  totalRequired={card.stamp_count_required}
                  rewardTitle={card.reward_title}
                  cardColor={card.card_color}
                  gradientIndex={id ? id.charCodeAt(0) : 0}
                  logoUrl={merchant.logo_url}
                  stampIcon={card.stamp_icon}
                  visitLabel={card.visit_label}
                />
                {card.reward_description ? (
                  <Text style={s.rewardFootnote}>{card.reward_description}</Text>
                ) : null}
              </View>
            </>
          )}

          {/* PIN reminder for non-members */}
          {!isMember && (
            <View style={s.pinReminder}>
              <Ionicons name="bulb-outline" size={16} color={J.teal} style={{ flexShrink: 0, marginTop: 1 }} />
              <Text style={s.pinReminderText}>
                {'Your PIN is on the '}
                <Text style={s.pinReminderLink} onPress={() => router.push('/(tabs)/')}>
                  Home tab
                </Text>
                {' — show it when you pay to get your first stamp'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },
  loadingScreen: { flex: 1, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  errorText: { fontSize: 16, fontFamily: FontFamily.semibold, color: J.inkSoft },
  backLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLink: { fontSize: 14, fontFamily: FontFamily.semibold, color: J.teal },

  // Cover
  cover: { height: 220, backgroundColor: J.teal },
  coverImg: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'flex-end' },
  coverWatermark: { marginRight: 24, marginBottom: 20 },
  coverScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  coverBack: {
    position: 'absolute',
    left: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },

  // Identity
  content: { paddingHorizontal: 20, gap: 0 },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: J.cream,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: -36,
    marginBottom: 12,
    ...Shadow.md,
  },
  logoTileRound: { borderRadius: 36 },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 26, fontFamily: FontFamily.extrabold },
  name: {
    fontSize: 24,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  metaCategory: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.teal },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: J.inkSoft, opacity: 0.6 },
  metaAddress: { fontSize: 13, fontFamily: FontFamily.medium, color: J.inkSoft, flexShrink: 1 },
  description: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 21,
    marginBottom: 16,
  },

  // Contact actions
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: J.teal,
  },
  callBtnText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
  directionsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  directionsBtnText: { fontSize: 14, fontFamily: FontFamily.bold, color: J.ink },

  // Shared card container
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...Shadow.sm,
  },

  // Member section
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successMuted,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    gap: 4,
  },
  memberText: { fontSize: 13, fontFamily: FontFamily.bold, color: Colors.success },
  viewCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,96,90,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 28,
  },
  viewCardText: { fontSize: 13, fontFamily: FontFamily.bold, color: J.teal },
  statsRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 26, fontFamily: FontFamily.extrabold, color: J.ink },
  statLabel: { fontSize: 10, fontFamily: FontFamily.medium, color: J.inkSoft, letterSpacing: 0.5 },
  statSep: { width: 1, backgroundColor: Colors.borderLight },

  // Join section
  joinTitle: {
    fontSize: 19,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  joinDesc: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 19,
    marginBottom: 14,
  },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  earnPill: {
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(0,96,90,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  earnPillText: {
    fontSize: 12, lineHeight: 16, includeFontPadding: false,
    fontFamily: FontFamily.semibold, color: J.teal,
  },
  rewardPill: {
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: Colors.goldMuted,
    flexDirection: 'row', alignItems: 'center',
    flexShrink: 1,
  },
  rewardPillText: {
    fontSize: 12, lineHeight: 16, includeFontPadding: false,
    fontFamily: FontFamily.bold, color: Colors.goldDark, flexShrink: 1,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: J.teal,
  },
  joinBtnText: { fontSize: 15, fontFamily: FontFamily.bold, color: '#fff' },

  // Stamp card block
  stampCardWrap: { marginBottom: 16 },
  previewLabel: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: J.inkSoft,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  rewardFootnote: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 18,
    marginTop: 10,
    paddingHorizontal: 4,
  },

  // PIN reminder
  pinReminder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(0,96,90,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  pinReminderText: { flex: 1, fontSize: 13, fontFamily: FontFamily.regular, color: J.teal, lineHeight: 19 },
  pinReminderLink: { fontFamily: FontFamily.bold, textDecorationLine: 'underline' },
});
