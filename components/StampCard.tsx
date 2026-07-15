import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Shadow } from '@/constants/theme';
import { getStampIcon } from '@/lib/stampIcons';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { visitLabelWord } from '@/lib/visitLabel';

type Props = {
  businessName: string;
  category: string;
  currentStamps: number;
  totalRequired: number;
  rewardTitle: string;
  cardColor?: string | null;
  gradientIndex?: number;
  logoUrl?: string | null;
  stampIcon?: string | null;
  visitLabel?: string | null;
  /** Wallet-stack mode: render only the header band with a stamp count. */
  collapsed?: boolean;
  onPress?: () => void;
};

export function StampCard({
  businessName,
  category,
  currentStamps,
  totalRequired,
  rewardTitle,
  cardColor,
  gradientIndex = 0,
  logoUrl,
  stampIcon = 'star',
  visitLabel,
  collapsed = false,
  onPress,
}: Props) {
  // The whole card wears the brand color. Text flips between a dark shade
  // of the brand and white based on the color's brightness, so any
  // merchant-picked color stays readable.
  const brand = cardGradient(cardColor, gradientIndex)[0];
  const dark = shadeColor(brand, 0.3);
  const num = parseInt(brand.replace('#', ''), 16);
  const brightness = (0.299 * ((num >> 16) & 0xff) + 0.587 * ((num >> 8) & 0xff) + 0.114 * (num & 0xff)) / 255;
  const isLightBrand = brightness > 0.45;
  const textOnBrand = isLightBrand ? dark : '#fff';
  const StampIcon = getStampIcon(stampIcon ?? 'star');

  const complete = currentStamps >= totalRequired;
  const stampsLeft = Math.max(0, totalRequired - currentStamps);
  const caption = complete
    ? `Reward ready — ${rewardTitle}!`
    : `${stampsLeft} more ${visitLabelWord(visitLabel, stampsLeft)} to get ${rewardTitle}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.94} style={[s.card, { backgroundColor: brand }]}>

      {/* Identity header */}
      <View style={[s.header, collapsed && s.headerCollapsed]}>
        <View style={s.logoBubble}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={s.logoImg} contentFit="contain" transition={150} cachePolicy="memory-disk" />
          ) : (
            <Text style={[s.logoInitials, { color: dark }]}>
              {businessName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </Text>
          )}
        </View>
        <View style={s.headerText}>
          <Text style={[s.name, { color: textOnBrand }]} numberOfLines={1}>{businessName}</Text>
          <Text style={[s.sub, { color: textOnBrand, opacity: 0.75 }]} numberOfLines={1}>{category}</Text>
        </View>
        {collapsed && (
          <Text style={[s.headerCount, { color: textOnBrand }]}>
            {Math.min(currentStamps, totalRequired)}/{totalRequired}
          </Text>
        )}
      </View>

      {collapsed ? null : (
      <>
      {/* Stamp field */}
      <View style={s.stampField}>
        {Array.from({ length: totalRequired }, (_, i) => {
          const filled = i < currentStamps;
          const isReward = i === totalRequired - 1;
          if (isReward) {
            return (
              <View key={i} style={[s.stamp, s.stampReward]}>
                <Ionicons name="gift" size={18} color={complete ? Colors.goldDark : dark} />
              </View>
            );
          }
          return (
            <View
              key={i}
              style={[
                s.stamp,
                filled ? { backgroundColor: dark } : s.stampEmpty,
              ]}
            >
              <StampIcon
                size={18}
                strokeWidth={2.2}
                color={filled ? '#fff' : (isLightBrand ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.40)')}
              />
            </View>
          );
        })}
      </View>

      {/* Caption */}
      <View style={s.caption}>
        <Text style={[s.captionText, { color: textOnBrand }]} numberOfLines={1}>{caption}</Text>
      </View>
      </>
      )}

    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    ...Shadow.md,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerCollapsed: { paddingBottom: 16 },
  headerCount: {
    fontSize: 15,
    fontFamily: FontFamily.extrabold,
    letterSpacing: -0.3,
  },
  logoBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 16, fontFamily: FontFamily.extrabold },
  headerText: { flex: 1 },
  name: {
    fontSize: 16,
    fontFamily: FontFamily.extrabold,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginTop: 2,
  },

  stampField: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stamp: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampEmpty: { backgroundColor: 'rgba(0,0,0,0.12)' },
  stampReward: { backgroundColor: 'rgba(255,255,255,0.92)' },

  caption: {
    paddingBottom: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  captionText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
  },
});
