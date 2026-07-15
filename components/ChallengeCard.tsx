import { TouchableOpacity, View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Radius, Spacing, Shadow } from '@/constants/theme';

const { width: W } = Dimensions.get('window');
const CARD_WIDTH = W - Spacing.xxl * 2;
const COLS = 5;
const GAP = Spacing.sm;
const DOT_SIZE = Math.floor((CARD_WIDTH - GAP * (COLS - 1) - Spacing.xl * 2) / COLS);

const PALETTES = [
  { top: '#006D77', bot: '#004050' },
  { top: '#5C4ECC', bot: '#3D32A8' },
  { top: '#2D9B5A', bot: '#1A6B3C' },
  { top: '#C85A1E', bot: '#8F3A0E' },
  { top: '#7B5EA7', bot: '#543B7A' },
];

type Props = {
  businessName: string;
  category: string;
  currentStamps: number;
  totalRequired: number;
  rewardTitle: string;
  gradientIndex?: number;
  onPress?: () => void;
};

export function ChallengeCard({
  businessName,
  category,
  currentStamps,
  totalRequired,
  rewardTitle,
  gradientIndex = 0,
  onPress,
}: Props) {
  const pal = PALETTES[gradientIndex % PALETTES.length];
  const pct = totalRequired > 0 ? Math.min(currentStamps / totalRequired, 1) : 0;
  const initials = businessName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  function renderDots() {
    const total = Math.max(totalRequired, 1);
    const dots = [];
    for (let i = 0; i < total; i++) {
      const filled = i < currentStamps;
      const isLast = i === total - 1;
      dots.push(
        <View
          key={i}
          style={[
            s.dot,
            { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
            filled ? { backgroundColor: pal.top } : s.dotEmpty,
          ]}
        >
          {filled ? (
            <Text style={[s.dotInitials, { fontSize: DOT_SIZE * 0.36 }]}>{initials}</Text>
          ) : isLast ? (
            <Ionicons name="gift-outline" size={DOT_SIZE * 0.44} color={Colors.textMuted} />
          ) : (
            <Text style={[s.dotNumber, { fontSize: DOT_SIZE * 0.38 }]}>{i + 1}</Text>
          )}
        </View>
      );
    }
    return dots;
  }

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={s.outer}>
      <View style={s.card}>
        {/* Image / Banner section */}
        <LinearGradient colors={[pal.top, pal.bot]} style={s.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={s.gloss} />

          {/* Business logo placeholder */}
          <View style={s.logo}>
            <Text style={s.logoText}>{initials || businessName[0]?.toUpperCase()}</Text>
          </View>

          {/* Progress badge */}
          <View style={s.progressBadge}>
            <Text style={s.progressBadgeText}>{currentStamps}/{totalRequired}</Text>
          </View>

          {/* Title block at bottom */}
          <View style={s.bannerBottom}>
            <Text style={s.categoryLabel}>{category.toUpperCase()}</Text>
            <Text style={s.businessName} numberOfLines={2}>{businessName}</Text>
          </View>
        </LinearGradient>

        {/* Reward label */}
        <View style={s.rewardRow}>
          <Ionicons name="gift-outline" size={13} color={pal.top} />
          <Text style={[s.rewardLabel, { color: pal.top }]} numberOfLines={1}>{rewardTitle}</Text>
        </View>

        {/* Progress bar */}
        <View style={s.progressBarTrack}>
          <View style={[s.progressBarFill, { width: `${pct * 100}%`, backgroundColor: pal.top }]} />
        </View>

        {/* Stamp dots */}
        <View style={s.dotsWrap}>
          {renderDots()}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  outer: {
    ...Shadow.card,
    borderRadius: Radius.xxl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  banner: {
    height: 160,
    padding: Spacing.xl,
    justifyContent: 'space-between',
  },
  gloss: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '55%',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoText: {
    fontSize: 20,
    fontFamily: FontFamily.extrabold,
    color: '#fff',
    letterSpacing: 0.5,
  },
  progressBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  progressBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  bannerBottom: {
    gap: 3,
  },
  categoryLabel: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
  },
  businessName: {
    fontSize: 20,
    fontFamily: FontFamily.extrabold,
    color: '#fff',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  rewardLabel: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    flex: 1,
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  dotsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotEmpty: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  dotInitials: {
    fontFamily: FontFamily.extrabold,
    color: '#fff',
  },
  dotNumber: {
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
});
