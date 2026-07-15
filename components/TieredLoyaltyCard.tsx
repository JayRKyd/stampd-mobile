import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

export type RewardTier = {
  id: string;
  stamp_threshold: number;
  reward_title: string;
  sort_order: number;
};

type Props = {
  businessName: string;
  category: string;
  currentStamps: number;
  tiers: RewardTier[];
  gradientIndex?: number;
  newStampIndex?: number;
};

function StampDot({ filled, size = 24 }: { filled: boolean; size?: number }) {
  return (
    <View style={[
      styles.dot,
      { width: size, height: size, borderRadius: size / 2 },
      filled ? styles.dotFilled : styles.dotEmpty,
    ]}>
      {filled && (
        <Text style={{ color: '#fff', fontSize: size * 0.4, fontFamily: FontFamily.bold }}>✓</Text>
      )}
    </View>
  );
}

function TierPill({ tier, currentStamps }: { tier: RewardTier; currentStamps: number }) {
  const earned = currentStamps >= tier.stamp_threshold;
  const active = !earned && currentStamps > 0;
  const remaining = tier.stamp_threshold - currentStamps;

  return (
    <View style={[
      styles.tierPill,
      earned && styles.tierPillEarned,
      active && !earned && styles.tierPillActive,
      !earned && !active && styles.tierPillInactive,
    ]}>
      <View style={[
        styles.tierIcon,
        earned && styles.tierIconEarned,
        active && !earned && styles.tierIconActive,
        !earned && !active && styles.tierIconInactive,
      ]}>
        <Ionicons
          name={earned ? 'checkmark' : active ? 'star-outline' : 'ellipse-outline'}
          size={10}
          color="#fff"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tierLabel, earned && { color: '#fff' }]}>
          {earned ? 'Earned!' : remaining > 0 ? `${remaining} more` : `${tier.stamp_threshold} stamps`}
        </Text>
        <Text style={[styles.tierReward, earned && { color: '#fff' }]}>
          {tier.reward_title}
        </Text>
      </View>
      {earned && <Ionicons name="checkmark" size={10} color="#fff" />}
    </View>
  );
}

export function TieredLoyaltyCard({
  businessName,
  category,
  currentStamps,
  tiers,
  gradientIndex = 0,
  newStampIndex,
}: Props) {
  const gradient = Colors.cardGradients[gradientIndex % Colors.cardGradients.length];
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  const maxThreshold = sorted[sorted.length - 1]?.stamp_threshold ?? 0;
  const isSingleTier = tiers.length === 1;

  function renderDots() {
    if (isSingleTier) {
      return (
        <View style={styles.dotsRow}>
          {Array.from({ length: maxThreshold }).map((_, i) => (
            <StampDot key={i} filled={i < currentStamps} size={maxThreshold > 10 ? 20 : 24} />
          ))}
        </View>
      );
    }

    let prevThreshold = 0;
    const segments = sorted.map(tier => {
      const dots = Array.from({ length: tier.stamp_threshold - prevThreshold }, (_, i) => prevThreshold + i);
      prevThreshold = tier.stamp_threshold;
      return { dots, tier };
    });

    return (
      <View style={styles.dotsRow}>
        {segments.map((seg, segIdx) => (
          <View key={seg.tier.id} style={styles.segment}>
            {seg.dots.map(i => (
              <StampDot key={i} filled={i < currentStamps} size={maxThreshold > 10 ? 20 : 24} />
            ))}
            {segIdx < segments.length - 1 && <View style={styles.tierDivider} />}
          </View>
        ))}
      </View>
    );
  }

  return (
    <LinearGradient colors={gradient} style={styles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.gloss} />

      <View style={styles.header}>
        <View>
          <Text style={styles.category}>{category}</Text>
          <Text style={styles.bizName}>{businessName}</Text>
        </View>
        <View style={styles.logo}>
          <Text style={styles.logoText}>{businessName[0].toUpperCase()}</Text>
        </View>
      </View>

      <View style={{ marginBottom: Spacing.md }}>{renderDots()}</View>

      {isSingleTier && (
        <View style={styles.footer}>
          <Text style={styles.progText}>{currentStamps}/{maxThreshold} stamps</Text>
          <View style={styles.rewardPill}>
            <Text style={styles.rewardPillText}>{sorted[0].reward_title}</Text>
          </View>
        </View>
      )}

      {!isSingleTier && (
        <View style={styles.tiersRow}>
          {sorted.map(tier => (
            <TierPill key={tier.id} tier={tier} currentStamps={currentStamps} />
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xxl, padding: Spacing.xl, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 8,
  },
  gloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl },
  category: { fontSize: 10, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  bizName: { fontSize: 18, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.3 },
  logo: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontFamily: FontFamily.extrabold, color: '#fff' },
  dotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center' },
  tierDivider: { width: 2, height: 24, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 1, marginHorizontal: 3 },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotFilled: { backgroundColor: Colors.gold, shadowColor: Colors.gold, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 3 },
  dotEmpty: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progText: { fontSize: 12, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.75)' },
  rewardPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  rewardPillText: { fontSize: 11, fontFamily: FontFamily.bold, color: '#fff' },
  tiersRow: { flexDirection: 'row', gap: Spacing.sm },
  tierPill: { flex: 1, borderRadius: Radius.lg, padding: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tierPillInactive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tierPillActive: { backgroundColor: 'rgba(212,168,67,0.2)', borderWidth: 1, borderColor: 'rgba(212,168,67,0.35)' },
  tierPillEarned: { backgroundColor: 'rgba(212,168,67,0.35)', borderWidth: 1, borderColor: 'rgba(212,168,67,0.6)' },
  tierIcon: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tierIconInactive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  tierIconActive: { backgroundColor: 'rgba(212,168,67,0.4)' },
  tierIconEarned: { backgroundColor: Colors.gold },
  tierLabel: { fontSize: 9, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  tierReward: { fontSize: 11, fontFamily: FontFamily.bold, color: '#fff' },
});
