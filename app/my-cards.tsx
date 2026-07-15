import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  LinearTransition,
  withDelay,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

// Entrance: spring ONLY the slide (that's the bounce) and plain-time the
// opacity — springing opacity makes it oscillate, which reads as a white
// flash on the card mid-bounce.
function cardEntrance(delay: number): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 24 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 220 })),
        transform: [
          { translateY: withDelay(delay, withSpring(0, { damping: 18, stiffness: 160 })) },
        ],
      },
    };
  };
}
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { cardGradient } from '@/lib/cardColor';
import { FontFamily, Palette as J, Shadow } from '@/constants/theme';
import { StampCard } from '@/components/StampCard';

type Membership = {
  id: string;
  current_stamps: number;
  last_stamp_at: string | null;
  merchants: { id: string; business_name: string; category: string; logo_url: string | null };
  loyalty_cards: { stamp_count_required: number; reward_title: string; stamp_icon: string | null; card_color: string | null; visit_label: string | null } | null;
};

export default function MyCardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: cardsData, isLoading } = useCachedData('my-cards', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: ms } = await supabase
      .from('memberships')
      .select(`id, current_stamps, last_stamp_at, merchants (id, business_name, category, logo_url), loyalty_cards (stamp_count_required, reward_title, stamp_icon, card_color, visit_label)`)
      .eq('user_id', user.id)
      .order('last_stamp_at', { ascending: false });

    return ((ms as any) ?? []) as Membership[];
  });

  const memberships = cardsData ?? [];
  const loaded = !isLoading;

  // Derived, not set-in-an-effect: the first card must be expanded on its
  // very first render, or the layout spring animates the late expansion
  // (visible as the card's bottom stretching during the entrance bounce).
  const activeId = expandedId ?? memberships[0]?.id ?? null;

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={J.teal} />
        </TouchableOpacity>
        <Text style={s.title}>My Cards</Text>
        {memberships.length > 0 ? (
          <View style={s.countPill}>
            <Text style={s.countText}>{memberships.length}</Text>
          </View>
        ) : (
          <View style={s.topBarSpacer} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 60 }]}
      >
        {loaded && memberships.length === 0 ? (
          <View style={s.emptyCard}>
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
          memberships.map((m, i) => {
            const expanded = activeId === m.id;
            const isLast = i === memberships.length - 1;
            // Wrapper wears the card's own color: the spring overshoot briefly
            // exceeds the painted content, and an unpainted strip flashes
            // white — brand-colored wrapper makes it invisible.
            const brand = cardGradient(m.loyalty_cards?.card_color, i)[0];
            return (
              <Animated.View
                key={m.id}
                layout={LinearTransition.springify().damping(18)}
                entering={cardEntrance(i * 60)}
                style={{
                  // Expanded card rides ABOVE its neighbors — otherwise the
                  // next card's white logo tile slides over it mid-bounce
                  zIndex: expanded ? memberships.length + 1 : i + 1,
                  backgroundColor: brand,
                  borderRadius: 20,
                  overflow: 'hidden',
                  // Collapsed cards tuck under the next one, wallet-style
                  marginBottom: expanded ? 16 : isLast ? 0 : -10,
                }}
              >
                <StampCard
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
                  collapsed={!expanded}
                  onPress={() => (expanded ? router.push(`/card/${m.id}`) : setExpandedId(m.id))}
                />
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  topBarSpacer: { width: 38, height: 38 },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    letterSpacing: -0.5,
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(0,96,90,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 13, fontFamily: FontFamily.extrabold, color: J.teal },

  content: { paddingHorizontal: 20, paddingTop: 8 },

  emptyCard: {
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
    color: J.inkSoft,
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
});
