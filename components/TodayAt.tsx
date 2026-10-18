import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily, Palette as J, Shadow } from '@/constants/theme';
import { Special, postedWhen } from '@/lib/specials';

// "Today at {shop}" block, shared by the card screen and the shop page.
// Renders nothing when the shop has nothing running.

export function TodayAt({ special }: { special: Special | null }) {
  const router = useRouter();
  if (!special) return null;
  return (
    <TouchableOpacity
      style={s.wrap}
      activeOpacity={0.88}
      onPress={() => router.push(`/special/${special.id}`)}
    >
      <View style={[s.thumb, { backgroundColor: special.card_color }]}>
        {special.image_url ? (
          <Image source={{ uri: special.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <Ionicons name="megaphone" size={18} color="#fff" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label}>TODAY AT {special.business_name.toUpperCase()}</Text>
        <Text style={s.line} numberOfLines={2}>{special.text}</Text>
        <Text style={s.meta}>{postedWhen(special)}{special.earns_stamp ? ' · Earns a stamp' : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={J.inkMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(0,96,90,0.28)',
    ...Shadow.sm,
  },
  thumb: {
    width: 52,
    height: 65,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontFamily: FontFamily.bold, color: J.teal, letterSpacing: 0.9 },
  line: { fontSize: 14, fontFamily: FontFamily.extrabold, color: J.ink, marginTop: 2, lineHeight: 18 },
  meta: { fontSize: 11, fontFamily: FontFamily.medium, color: J.inkSoft, marginTop: 3 },
});
