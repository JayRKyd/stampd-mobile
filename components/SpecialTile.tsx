import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { Special, tagLabel, initials } from '@/lib/specials';

// One post as a 4:5 tile: the merchant's flyer if they added one, otherwise
// a card in their brand colour with the line on it. Same tile everywhere.

export function SpecialTile({ special, width, onPress }: { special: Special; width: number; onPress: () => void }) {
  const height = Math.round(width * 1.25);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[s.tile, { width, height, backgroundColor: special.card_color }, special.is_mine && s.tileMine]}
    >
      {special.image_url ? (
        <Image
          source={{ uri: special.image_url }}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={s.textOnly}>
          <Text style={s.textOnlyLine} numberOfLines={5}>{special.text}</Text>
        </View>
      )}

      <View style={s.tag}>
        <Text style={s.tagText}>{tagLabel(special)}</Text>
      </View>

      {/* Deeper hue so the name reads over busy flyer artwork */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']} locations={[0, 0.45, 1]} style={s.foot}>
        <View style={s.logo}>
          {special.logo_url ? (
            <Image source={{ uri: special.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
          ) : (
            <Text style={[s.logoInitials, { color: special.card_color }]}>{initials(special.business_name)}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{special.business_name}</Text>
          {special.earns_stamp && <Text style={s.earns}>Earns a stamp</Text>}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  tile: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0f1c20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  tileMine: { borderWidth: 2, borderColor: 'rgba(0,96,90,0.55)' },
  textOnly: { flex: 1, padding: 14, justifyContent: 'center' },
  textOnlyLine: { fontSize: 16, lineHeight: 21, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.2 },
  tag: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: { fontSize: 9, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 0.6 },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 34,
    paddingBottom: 9,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: J.cream,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 9, fontFamily: FontFamily.extrabold },
  name: { fontSize: 11.5, fontFamily: FontFamily.extrabold, color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  earns: { fontSize: 9.5, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.85)' },
});
