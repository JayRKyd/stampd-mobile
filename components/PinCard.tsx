import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Shadow } from '@/constants/theme';

type Props = {
  pinDisplay: string;
  holderName: string;
  memberSince: string; // "07/26"
  masked?: boolean;
  onToggleMask?: () => void;
  onPress?: () => void;
};

/**
 * The member's PIN as a premium card — credit-card proportions, chip,
 * wordmark, holder line. This is the app's physical-object hero.
 */
export function PinCard({
  pinDisplay,
  holderName,
  memberSince,
  masked = false,
  onToggleMask,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.93 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={s.wrap}
    >
      <LinearGradient
        colors={['#0F8A7E', '#03635B', '#02322E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}
      >
        {/* Faceted planes, like light catching the card */}
        <View style={[s.facet, s.facetA]} />
        <View style={[s.facet, s.facetB]} />
        <View style={[s.facet, s.facetC]} />
        <LinearGradient
          colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 0.9 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Top row */}
        <View style={s.topRow}>
          <Text style={s.label}>Member Pass</Text>
          <Text style={s.wordmark}>STAMPD</Text>
        </View>

        {/* Chip */}
        <LinearGradient
          colors={['#F0D78A', '#D4A843', '#B8922E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.chip}
        >
          <View style={s.chipLineH} />
          <View style={[s.chipLineH, { top: '72%' }]} />
          <View style={s.chipLineV} />
        </LinearGradient>

        {/* PIN as the card number */}
        <View style={s.pinRow}>
          <Text style={s.pin}>{pinDisplay}</Text>
          {onToggleMask && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onToggleMask();
              }}
              style={s.eyeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={masked ? 'eye-outline' : 'eye-off-outline'}
                size={17}
                color="rgba(255,255,255,0.75)"
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {/* Bottom row — holder + since, like name + expiry */}
        <View style={s.bottomRow}>
          <View style={s.bottomCol}>
            <Text style={s.bottomLabel}>MEMBER</Text>
            <Text style={s.bottomValue} numberOfLines={1}>{holderName}</Text>
          </View>
          <View style={[s.bottomCol, { alignItems: 'flex-end', flexShrink: 0 }]}>
            <Text style={s.bottomLabel}>SINCE</Text>
            <Text style={s.bottomValue}>{memberSince}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    ...Shadow.md,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  card: {
    aspectRatio: 1.586,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },

  facet: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.05)' },
  facetA: {
    width: 300,
    height: 300,
    top: -140,
    right: -130,
    transform: [{ rotate: '45deg' }],
  },
  facetB: {
    width: 220,
    height: 220,
    bottom: -150,
    left: 30,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  facetC: {
    width: 180,
    height: 180,
    top: 40,
    right: -120,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
  wordmark: {
    fontSize: 14,
    fontFamily: FontFamily.extrabold,
    color: '#fff',
    letterSpacing: 2.5,
  },

  chip: {
    width: 44,
    height: 33,
    borderRadius: 7,
    marginTop: 18,
    overflow: 'hidden',
  },
  chipLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  chipLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },

  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  pin: {
    fontSize: 28,
    fontFamily: FontFamily.extrabold,
    color: '#fff',
    letterSpacing: 7,
  },
  eyeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  bottomCol: { flexShrink: 1 },
  bottomLabel: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  bottomValue: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: '#fff',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
