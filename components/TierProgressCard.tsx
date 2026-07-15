import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Radius, Spacing, Shadow } from '@/constants/theme';

export const TIERS = [
  { name: 'Starter', range: '0 - 20', min: 0 },
  { name: 'Champ',   range: '20 - 50', min: 20 },
  { name: 'Star',    range: '50 - 100', min: 50 },
  { name: 'Legend',  range: '100+',     min: 100 },
] as const;

export function getTierIndex(stamps: number): number {
  if (stamps >= 100) return 3;
  if (stamps >= 50) return 2;
  if (stamps >= 20) return 1;
  return 0;
}

const NODE = 16;

export function TierProgressCard({ totalStamps }: { totalStamps: number }) {
  const idx = getTierIndex(totalStamps);
  const tier = TIERS[idx];
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  const toNext = next ? next.min - totalStamps : 0;
  const trackPct = (idx / (TIERS.length - 1)) * 100;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.title}>YOU'RE A {tier.name.toUpperCase()}.</Text>
        <TouchableOpacity style={s.knowBtn} activeOpacity={0.85}>
          <Text style={s.knowBtnText}>Know +</Text>
        </TouchableOpacity>
      </View>

      {/* Subtitle */}
      <Text style={s.sub}>
        You have <Text style={s.bold}>{totalStamps}</Text> stamps.
      </Text>
      {next ? (
        <Text style={s.sub}>
          Get <Text style={s.bold}>{toNext}</Text> more for {next.name}!
        </Text>
      ) : (
        <Text style={s.sub}>You've reached the highest tier. Legend.</Text>
      )}

      {/* Track */}
      <View style={s.trackSection}>
        {/* Bar + nodes */}
        <View style={s.barContainer}>
          <View style={s.bar} />
          {trackPct > 0 && (
            <View style={[s.barFill, { width: `${trackPct}%` as any }]} />
          )}
          {TIERS.map((t, i) => {
            const leftPct = (i / (TIERS.length - 1)) * 100;
            const filled = idx >= i;
            const tx = i === 0 ? 0 : i === TIERS.length - 1 ? -NODE : -NODE / 2;
            return (
              <View
                key={t.name}
                style={[
                  s.node,
                  filled ? s.nodeFilled : s.nodeEmpty,
                  { left: `${leftPct}%` as any, transform: [{ translateX: tx }] },
                ]}
              />
            );
          })}
        </View>

        {/* Labels */}
        <View style={s.labelsRow}>
          {TIERS.map((t, i) => (
            <View
              key={t.name}
              style={[
                s.labelBlock,
                i === 0 && { alignItems: 'flex-start' },
                i === TIERS.length - 1 && { alignItems: 'flex-end' },
              ]}
            >
              <Text style={[s.labelName, idx === i && s.labelNameActive]}>{t.name}</Text>
              <Text style={s.labelRange}>{t.range}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.extrabold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  knowBtn: {
    backgroundColor: Colors.text,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  knowBtnText: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: '#fff',
  },
  sub: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  bold: {
    fontFamily: FontFamily.extrabold,
    color: Colors.text,
  },
  trackSection: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  barContainer: {
    height: NODE,
    position: 'relative',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
  },
  nodeFilled: {
    backgroundColor: Colors.primary,
    borderWidth: 2.5,
    borderColor: Colors.surface,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 3,
  },
  nodeEmpty: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelBlock: {
    alignItems: 'center',
  },
  labelName: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  labelNameActive: {
    color: Colors.primary,
  },
  labelRange: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
