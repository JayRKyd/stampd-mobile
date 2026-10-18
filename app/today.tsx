import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Palette as J } from '@/constants/theme';
import { useSpecialsToday } from '@/lib/specials';
import { SpecialTile } from '@/components/SpecialTile';

// The island view: everything running today, your spots first.

const GAP = 12;
const TILE_W = Math.floor((Dimensions.get('window').width - 40 - GAP) / 2);

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { specials, mine, others, isLoading } = useSpecialsToday();

  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={J.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>Today in Grand Bahama</Text>
          <Text style={s.sub}>{dateLine} · {specials.length} {specials.length === 1 ? 'POST' : 'POSTS'}</Text>
        </View>
      </View>

      <View style={s.sheet}>
        {isLoading && specials.length === 0 ? (
          <ActivityIndicator color={J.teal} style={{ marginTop: 40 }} />
        ) : specials.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="megaphone-outline" size={28} color={J.teal} />
            </View>
            <Text style={s.emptyTitle}>Nothing on yet today</Text>
            <Text style={s.emptyBody}>Shops usually post before lunch. Check back, or browse every shop on Stampd.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.navigate('/(tabs)/discover')} activeOpacity={0.85}>
              <Text style={s.emptyBtnText}>Browse shops</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
            {mine.length > 0 && (
              <>
                <Text style={s.label}>YOUR SPOTS</Text>
                <View style={s.grid}>
                  {mine.map(sp => <SpecialTile key={sp.id} special={sp} width={TILE_W} onPress={() => router.push(`/special/${sp.id}`)} />)}
                </View>
              </>
            )}
            {others.length > 0 && (
              <>
                <Text style={[s.label, mine.length > 0 && { marginTop: 18 }]}>AROUND THE ISLAND</Text>
                <View style={s.grid}>
                  {others.map(sp => <SpecialTile key={sp.id} special={sp} width={TILE_W} onPress={() => router.push(`/special/${sp.id}`)} />)}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 18 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.4 },
  sub: { fontSize: 11, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8, marginTop: 2 },
  sheet: { flex: 1, backgroundColor: J.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18 },
  label: { fontSize: 11, fontFamily: FontFamily.semibold, color: J.inkSoft, letterSpacing: 0.8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 8 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(0,96,90,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,96,90,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontFamily: FontFamily.extrabold, color: J.ink, marginBottom: 6 },
  emptyBody: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, textAlign: 'center', lineHeight: 19, maxWidth: 260, marginBottom: 18 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: J.teal, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  emptyBtnText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
});
