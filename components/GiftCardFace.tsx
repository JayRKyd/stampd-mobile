import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { cardGradient } from '@/lib/cardColor';
import { GiftCard, money } from '@/lib/giftCards';

// The gift card, as it looks everywhere: the shop's colour, a gold ribbon
// across the top corner, the amount, who it's for and from, the note.
// Same card in the reveal, on the card screen, in the claim preview.

export const GIFT_FACE_RATIO = 0.68;

export function GiftCardFace({
  card, width, amountCents, amountNote, amountAnimatedStyle, dimmed = false, style,
}: {
  card: GiftCard;
  width: number;
  /** What the big number shows; defaults to the original amount */
  amountCents?: number;
  /** Small line under the number, e.g. "left of $50.00" */
  amountNote?: string;
  amountAnimatedStyle?: StyleProp<ViewStyle>;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [c1, c2] = cardGradient(card.card_color, 0);
  const height = Math.round(width * GIFT_FACE_RATIO);
  const initials = card.business_name.slice(0, 2).toUpperCase();
  const who = [card.for_name ? `FOR ${card.for_name.toUpperCase()}` : null, card.from_name ? `FROM ${card.from_name.toUpperCase()}` : null]
    .filter(Boolean).join(' · ');
  const AmountText = amountAnimatedStyle ? Animated.Text : Text;

  return (
    <View style={[s.card, { width, height }, dimmed && { opacity: 0.6 }, style]}>
      <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* a warm glow behind the ribbon corner */}
      <LinearGradient
        colors={['rgba(212,168,67,0.26)', 'rgba(212,168,67,0)']}
        start={{ x: 1, y: 0 }} end={{ x: 0.35, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />
      {/* the ribbon */}
      <View style={s.ribbon} pointerEvents="none">
        <LinearGradient colors={['#e9cd74', '#d4a843', '#c09a35']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={s.ribbonText}>GIFT</Text>
      </View>

      <View style={s.inner}>
        <View style={s.head}>
          <View style={s.logo}>
            {card.logo_url ? (
              <Image source={{ uri: card.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
            ) : (
              <Text style={[s.logoInitials, { color: c1 }]}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 56 }}>
            <Text style={s.name} numberOfLines={1}>{card.business_name}</Text>
            <Text style={s.sub} numberOfLines={1}>Gift card</Text>
          </View>
        </View>

        <AmountText style={[s.amount, amountAnimatedStyle as any]}>{money(amountCents ?? card.amount_cents)}</AmountText>
        {!!amountNote && <Text style={s.amountNote}>{amountNote}</Text>}
        {!!who && <Text style={s.who} numberOfLines={1}>{who}</Text>}

        {!!card.note && (
          <View style={s.noteRow}>
            <View style={s.noteBar} />
            <Text style={s.note} numberOfLines={2}>“{card.note}”</Text>
          </View>
        )}

        <View style={s.foot}>
          <Text style={s.footText} numberOfLines={1}>GIFT CARD · {card.business_name.toUpperCase()} ONLY</Text>
          <Text style={s.footText}>STAMPD</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.3, shadowRadius: 22, elevation: 10,
  },
  inner: { flex: 1, padding: 18 },
  ribbon: {
    position: 'absolute', top: 22, right: -48, width: 180, height: 26,
    transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
  },
  ribbonText: { fontSize: 11, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 11, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 13, fontFamily: FontFamily.extrabold },
  name: { fontSize: 15, fontFamily: FontFamily.extrabold, color: '#fff' },
  sub: { fontSize: 11, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.7)' },
  amount: { fontSize: 40, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -1.5, lineHeight: 46, marginTop: 14, alignSelf: 'flex-start' },
  amountNote: { fontSize: 11, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  who: { fontSize: 10, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.78)', letterSpacing: 1, marginTop: 6 },
  noteRow: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-start' },
  noteBar: { width: 3, borderRadius: 2, backgroundColor: Colors.gold, alignSelf: 'stretch' },
  note: { flex: 1, fontSize: 12.5, fontFamily: FontFamily.regular, fontStyle: 'italic', color: 'rgba(255,255,255,0.92)', lineHeight: 17 },
  foot: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  footText: { fontSize: 9.5, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
});
