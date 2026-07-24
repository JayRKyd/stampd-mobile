import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { visitLabelWord } from '@/lib/visitLabel';
import { Colors, FontFamily, Palette as J, Spacing, Shadow } from '@/constants/theme';

type Merchant = {
  id: string;
  business_name: string;
  category: string;
  address: string | null;
  logo_url: string | null;
  merchant_type: 'business' | 'individual' | null;
  trade: string | null;
  workplace: string | null;
  loyalty_cards: { reward_title: string; card_color: string | null; stamp_count_required: number; visit_label: string | null }[];
};

const CATEGORIES = ['All', 'Pros', 'Food & Dining', 'Coffee & Drinks', 'Health & Wellness', 'Retail', 'Beauty & Salon', 'Entertainment'];

const CATEGORY_ICONS: Record<string, string> = {
  'Pros': 'person-outline',
  'Food & Dining': 'restaurant-outline',
  'Coffee & Drinks': 'cafe-outline',
  'Health & Wellness': 'fitness-outline',
  'Retail': 'bag-handle-outline',
  'Beauty & Salon': 'cut-outline',
  'Entertainment': 'musical-notes-outline',
};

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const { data: dirData, isLoading: loading } = useCachedData('discover', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: ms }, { data }] = await Promise.all([
      supabase
        .from('memberships')
        .select('merchants(id)')
        .eq('user_id', user.id),
      supabase
        .from('merchants')
        .select('id, business_name, category, address, logo_url, merchant_type, trade, workplace, loyalty_cards(reward_title, card_color, stamp_count_required, visit_label)')
        .eq('is_active', true)
        .order('business_name'),
    ]);

    return {
      joinedIds: ((ms ?? []) as any[]).map(m => m.merchants?.id).filter(Boolean) as string[],
      merchants: ((data as any) ?? []) as Merchant[],
    };
  });

  const merchants = dirData?.merchants ?? [];
  const joinedIds = dirData?.joinedIds ?? [];

  const filtered = useMemo(() => {
    let results = merchants;
    if (activeCategory === 'Pros') {
      results = results.filter(m => m.merchant_type === 'individual');
    } else if (activeCategory !== 'All') {
      results = results.filter(m => m.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      // Match name OR category/trade, so "barber" finds barbers
      results = results.filter(m =>
        m.business_name.toLowerCase().includes(q) ||
        (m.category ?? '').toLowerCase().includes(q)
      );
    }
    return results;
  }, [search, activeCategory, merchants]);

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  }

  return (
    <View style={s.root}>
      {/* Teal header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerEyebrow}>All Businesses</Text>
            <Text style={s.headerTitle}>Discover</Text>
          </View>
          <TouchableOpacity
            style={s.headerBell}
            onPress={() => router.navigate('/notifications')}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search inside header */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={17} color="#9AA5A3" />
          <TextInput
            style={s.searchInput}
            placeholder="Search a merchant"
            placeholderTextColor="#9AA5A3"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color="#9AA5A3" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Cream sheet */}
      <View style={s.sheet}>
        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chipsScroll}
          contentContainerStyle={s.chipsContent}
        >
          {CATEGORIES.map(cat => {
            const icon = CATEGORY_ICONS[cat];
            const active = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[s.chip, active && s.chipActive]}
                activeOpacity={0.7}
              >
                {icon && (
                  <Ionicons
                    name={icon as any}
                    size={13}
                    color={active ? '#fff' : J.inkSoft}
                  />
                )}
                <Text style={[s.chipText, active && s.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results count */}
        {!loading && (
          <Text style={s.resultsLabel}>
            {filtered.length} {filtered.length === 1 ? 'business' : 'businesses'}
            {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
          </Text>
        )}

        {/* List */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 100 }]}
        >
          {loading ? (
            <View style={s.loader}>
              <ActivityIndicator color={J.teal} size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIconBox}>
                <Ionicons name="search-outline" size={28} color={J.inkSoft} />
              </View>
              <Text style={s.emptyTitle}>No businesses found</Text>
              <Text style={s.emptyBody}>
                {search.trim()
                  ? `No results for "${search}" — try a different name`
                  : 'No businesses in this category yet'}
              </Text>
              {(search.trim() || activeCategory !== 'All') && (
                <TouchableOpacity
                  onPress={() => { setSearch(''); setActiveCategory('All'); }}
                  style={s.emptyAction}
                  activeOpacity={0.7}
                >
                  <Text style={s.emptyActionText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : filtered.map((m, idx) => {
            const card = m.loyalty_cards?.[0];
            const isJoined = joinedIds.includes(m.id);
            // People render as circles, places as rounded squares
            const isIndividual = m.merchant_type === 'individual';
            // Merchants sometimes type the "@" themselves (the onboarding
            // placeholder shows one) — strip it so we never render "@ @"
            const workplace = m.workplace?.replace(/^@\s*/, '') ?? null;
            const tradeLabel = isIndividual && m.category === 'Other' ? 'Independent Pro' : m.category;
            const subLine = isIndividual
              ? `${tradeLabel}${workplace ? ` · @ ${workplace}` : ''}`
              : m.category;
            // Same brand-color language as StampCard: merchant color (or a
            // stable fallback) drives the accents and the reward strip.
            const brand = cardGradient(card?.card_color, m.id.charCodeAt(0))[0];
            const dark = shadeColor(brand, 0.3);

            return (
              <TouchableOpacity
                key={m.id}
                style={s.card}
                onPress={() => router.navigate(`/discover/${m.id}`)}
                activeOpacity={0.92}
              >
                <View style={s.cardInner}>
                  {/* Logo */}
                  <View style={s.logoWrap}>
                    {m.logo_url ? (
                      <View style={[s.logoBox, isIndividual && s.logoBoxRound]}>
                        <Image source={{ uri: m.logo_url }} style={s.logoImg} contentFit={isIndividual ? 'cover' : 'contain'} transition={150} cachePolicy="memory-disk" />
                      </View>
                    ) : (
                      <View style={[s.logoBox, isIndividual && s.logoBoxRound, { backgroundColor: `${brand}1A` }]}>
                        <Text style={[s.logoInitials, { color: dark }]}>{initials(m.business_name)}</Text>
                      </View>
                    )}
                    {isJoined && (
                      <View style={s.memberDot}>
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={s.cardInfo}>
                    <Text style={s.cardName} numberOfLines={1}>{m.business_name}</Text>
                    <Text style={s.cardCategory} numberOfLines={1}>{subLine}</Text>
                    {m.address ? (
                      <View style={s.cardAddress}>
                        <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.cardAddressText} numberOfLines={1}>{m.address}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>

                {/* Deal-math pills (Joyn style): earn rule + payoff */}
                {card && (() => {
                  const rawLabel = (card.visit_label ?? 'stamp').toLowerCase();
                  const earnWord = rawLabel === 'stamp' ? 'visit' : visitLabelWord(card.visit_label, 1);
                  return (
                    <View style={s.cardFooter}>
                      <View style={s.earnPill}>
                        <Text style={s.earnPillText}>1 {earnWord} = 1 stamp</Text>
                      </View>
                      <View style={s.rewardPill}>
                        <Text style={s.rewardPillText} numberOfLines={1}>
                          {card.stamp_count_required} ={' '}
                        </Text>
                        <Ionicons name="gift" size={12} color={Colors.goldDark} />
                        <Text style={s.rewardPillText} numberOfLines={1}> {card.reward_title}</Text>
                      </View>
                    </View>
                  );
                })()}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },

  // Header
  header: { backgroundColor: J.teal, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: Spacing.lg,
  },
  headerEyebrow: {
    fontSize: 12, fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.6)', marginBottom: 2, letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 30, fontFamily: FontFamily.extrabold,
    color: '#fff', letterSpacing: -0.6, lineHeight: 34,
  },
  headerBell: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },

  // Search (inside header)
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 24,
    paddingHorizontal: 14, height: 48,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1, fontSize: 15,
    fontFamily: FontFamily.medium, color: J.ink,
  },

  // Sheet
  sheet: {
    flex: 1, backgroundColor: J.cream,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 18, overflow: 'hidden',
  },

  // Chips — explicit height so the flex layout can never squeeze
  // the row and clip the 34px chips
  chipsScroll: { height: 38, flexGrow: 0, flexShrink: 0, marginBottom: Spacing.xs },
  chipsContent: { paddingHorizontal: 20, gap: Spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, height: 34, borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  chipActive: { backgroundColor: J.teal, borderColor: J.teal },
  chipText: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.inkSoft },
  chipTextActive: { color: '#fff', fontFamily: FontFamily.bold },

  // Results label
  resultsLabel: {
    fontSize: 12, fontFamily: FontFamily.medium,
    color: J.inkSoft, paddingHorizontal: 20,
    marginTop: Spacing.md, marginBottom: Spacing.sm,
  },

  // List
  list: { paddingHorizontal: 20, paddingTop: Spacing.sm },
  loader: { alignItems: 'center', paddingVertical: 80 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 20, marginBottom: 14,
    ...Shadow.md, overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    gap: 12,
  },

  // Logo
  logoWrap: { position: 'relative' },
  logoBox: {
    width: 56, height: 56, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBoxRound: { borderRadius: 28 },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 20, fontFamily: FontFamily.extrabold },
  memberDot: {
    position: 'absolute', bottom: -3, right: -3,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  // Card info
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16, fontFamily: FontFamily.extrabold,
    color: J.ink, letterSpacing: -0.3,
  },
  cardCategory: {
    fontSize: 12, fontFamily: FontFamily.medium,
    color: J.inkSoft, marginTop: 2,
  },
  cardAddress: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  cardAddressText: {
    fontSize: 12, fontFamily: FontFamily.regular,
    color: Colors.textMuted, flex: 1,
  },

  // Card footer (deal-math pills)
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  earnPill: {
    height: 26, borderRadius: 13, paddingHorizontal: 10,
    backgroundColor: 'rgba(0,96,90,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  earnPillText: { fontSize: 12, fontFamily: FontFamily.semibold, color: J.teal },
  rewardPill: {
    height: 26, borderRadius: 13, paddingHorizontal: 10,
    backgroundColor: Colors.goldMuted,
    flexDirection: 'row', alignItems: 'center',
    flexShrink: 1,
  },
  rewardPillText: { fontSize: 12, fontFamily: FontFamily.bold, color: Colors.goldDark, flexShrink: 1 },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyIconBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontFamily: FontFamily.extrabold, color: J.ink },
  emptyBody: {
    fontSize: 13, fontFamily: FontFamily.regular,
    color: J.inkSoft, textAlign: 'center', maxWidth: 260,
  },
  emptyAction: {
    marginTop: Spacing.sm, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md, borderRadius: 22,
    backgroundColor: J.teal,
  },
  emptyActionText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
});
