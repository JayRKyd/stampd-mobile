import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, Palette as J } from '@/constants/theme';
import { ISLANDS, IslandId, useIsland } from '@/lib/island';

// The island sheet. Opens from the badge on Home and the label on Discover.
// One tap to switch; the same sheet new customers see after sign-up.

export function IslandPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { island, setIsland } = useIsland();

  const pick = (id: IslandId) => {
    setIsland(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.grab} />
        <Text style={s.title}>Choose your island</Text>
        <Text style={s.sub}>You'll see the shops near you. Your cards and rewards stay with you on every island.</Text>

        {ISLANDS.map(i => {
          const on = i.id === island;
          return (
            <TouchableOpacity key={i.id} style={[s.row, on && s.rowOn]} onPress={() => pick(i.id)} activeOpacity={0.85}>
              <View style={[s.pin, on && s.pinOn]}>
                <Ionicons name="location" size={16} color={on ? '#fff' : J.teal} />
              </View>
              <Text style={[s.rowText, on && s.rowTextOn]}>{i.name}</Text>
              {on && <Ionicons name="checkmark-circle" size={22} color={J.teal} />}
            </TouchableOpacity>
          );
        })}

        <View style={[s.row, s.rowSoon]}>
          <View style={s.pin}>
            <Ionicons name="ellipsis-horizontal" size={16} color={J.inkMuted} />
          </View>
          <Text style={[s.rowText, { color: J.inkMuted }]}>More islands</Text>
          <Text style={s.soon}>Coming soon</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,37,31,0.45)' },
  sheet: {
    backgroundColor: J.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)', marginBottom: 16 },
  title: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.4 },
  sub: { fontSize: 13.5, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 19, marginTop: 4, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  rowOn: { borderColor: J.teal },
  rowSoon: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.12)' },
  pin: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,96,90,0.1)', alignItems: 'center', justifyContent: 'center' },
  pinOn: { backgroundColor: J.teal },
  rowText: { flex: 1, fontSize: 16, fontFamily: FontFamily.semibold, color: J.ink },
  rowTextOn: { fontFamily: FontFamily.extrabold },
  soon: { fontSize: 11, fontFamily: FontFamily.bold, color: J.inkMuted, letterSpacing: 0.4 },
});
