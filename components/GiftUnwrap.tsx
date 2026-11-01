import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, withSequence, withRepeat,
  Easing, cancelAnimation, runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { GiftCard, money } from '@/lib/giftCards';

// The unwrap. Shown once, right after a gift card is claimed: a wrapped
// present in the shop's colour, tap the bow, the ribbon comes off, the lid
// lifts, and the card rises out with the note typing itself underneath.
// Plays the same role the golden ticket plays for a finished stamp card.

const { width: SCREEN_W } = Dimensions.get('window');
const BOX_W = Math.min(300, SCREEN_W - 80);
const BOX_H = Math.round(BOX_W * 0.68);
const CARD_W = Math.min(330, SCREEN_W - 48);
const CARD_H = Math.round(CARD_W * 0.62);
const RIBBON = 30;

const GOLD: [string, string, string] = ['#e9cd74', '#d4a843', '#b8922e'];

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

function Bow({ color }: { color: string }) {
  // Two loops, two tails, a knot. Built from gradients so it reads as ribbon, not clip art.
  return (
    <View style={b.wrap} pointerEvents="none">
      <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[b.loop, b.loopLeft]} />
      <LinearGradient colors={GOLD} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[b.loop, b.loopRight]} />
      <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[b.tail, b.tailLeft]} />
      <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[b.tail, b.tailRight]} />
      <LinearGradient colors={[GOLD[0], GOLD[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={b.knot}>
        <View style={[b.knotShine, { backgroundColor: color, opacity: 0.18 }]} />
      </LinearGradient>
    </View>
  );
}

const b = StyleSheet.create({
  wrap: { width: 110, height: 70, alignItems: 'center', justifyContent: 'center' },
  loop: { position: 'absolute', width: 48, height: 34, borderRadius: 24, top: 10 },
  loopLeft: { left: 6, transform: [{ rotate: '-22deg' }] },
  loopRight: { right: 6, transform: [{ rotate: '22deg' }] },
  tail: { position: 'absolute', width: 16, height: 36, borderRadius: 4, top: 36 },
  tailLeft: { left: 30, transform: [{ rotate: '18deg' }] },
  tailRight: { right: 30, transform: [{ rotate: '-18deg' }] },
  knot: { width: 24, height: 22, borderRadius: 8, top: -2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  knotShine: { width: 24, height: 10, borderRadius: 5, marginTop: -8 },
});

export function GiftUnwrap({ card, visible, onDone }: { card: GiftCard; visible: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState(false);
  const [typed, setTyped] = useState('');
  const [ready, setReady] = useState(false);
  const typer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [c1, c2] = cardGradient(card.card_color, 0);
  const lidColor = shadeColor(c1, 0.78);
  const deep = shadeColor(c1, 0.35);

  // Present
  const bowPulse = useSharedValue(1);
  const bowScale = useSharedValue(1);
  const ribbonV = useSharedValue(0);
  const ribbonH = useSharedValue(0);
  const ribbonFade = useSharedValue(1);
  const lidY = useSharedValue(0);
  const lidRot = useSharedValue(0);
  const lidFade = useSharedValue(1);
  const boxY = useSharedValue(0);
  const boxFade = useSharedValue(1);
  const hintFade = useSharedValue(1);
  // Card
  const cardY = useSharedValue(60);
  const cardScale = useSharedValue(0.9);
  const cardFade = useSharedValue(0);
  const amountScale = useSharedValue(0.6);
  const shimmerX = useSharedValue(-CARD_W);
  const footerFade = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    bowPulse.value = withRepeat(withSequence(
      withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
    ), -1, true);
    return () => { cancelAnimation(bowPulse); if (typer.current) clearInterval(typer.current); };
  }, [visible, bowPulse]);

  const startTyping = () => {
    const text = card.note ? `“${card.note}”` : '';
    if (!text) { setTimeout(() => setReady(true), 500); return; }
    let i = 0;
    typer.current = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        if (typer.current) clearInterval(typer.current);
        setTimeout(() => setReady(true), 350);
      }
    }, 28);
  };

  const unwrap = () => {
    if (opened) return;
    setOpened(true);
    cancelAnimation(bowPulse);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    hintFade.value = withTiming(0, { duration: 200 });

    // 1. bow pops, ribbon slides off
    bowScale.value = withSequence(withTiming(1.18, { duration: 120 }), withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }));
    ribbonV.value = withDelay(120, withTiming(-BOX_H * 1.6, { duration: 520, easing: Easing.in(Easing.cubic) }));
    ribbonH.value = withDelay(160, withTiming(BOX_W * 1.4, { duration: 520, easing: Easing.in(Easing.cubic) }));
    ribbonFade.value = withDelay(360, withTiming(0, { duration: 260 }));

    // 2. lid lifts, box sinks
    lidY.value = withDelay(380, withTiming(-170, { duration: 560, easing: Easing.out(Easing.cubic) }));
    lidRot.value = withDelay(380, withTiming(-9, { duration: 560, easing: Easing.out(Easing.cubic) }));
    lidFade.value = withDelay(640, withTiming(0, { duration: 300 }));
    boxY.value = withDelay(640, withTiming(90, { duration: 520, easing: Easing.in(Easing.cubic) }));
    boxFade.value = withDelay(640, withTiming(0, { duration: 420 }));

    // 3. card rises
    cardFade.value = withDelay(560, withTiming(1, { duration: 320 }));
    cardY.value = withDelay(560, withSpring(0, { damping: 15, stiffness: 140, mass: 0.9 }));
    cardScale.value = withDelay(560, withSpring(1, { damping: 14, stiffness: 150 }));
    amountScale.value = withDelay(820, withSpring(1, { damping: 11, stiffness: 180 }, (done) => {
      if (done) runOnJS(startTyping)();
    }));
    shimmerX.value = withDelay(1000, withTiming(CARD_W * 1.4, { duration: 900, easing: Easing.inOut(Easing.quad) }));

    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 600);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 840);
  };

  useEffect(() => {
    if (ready) footerFade.value = withTiming(1, { duration: 360 });
  }, [ready, footerFade]);

  const bowStyle = useAnimatedStyle(() => ({ transform: [{ scale: bowPulse.value * bowScale.value }] }));
  const ribbonVStyle = useAnimatedStyle(() => ({ opacity: ribbonFade.value, transform: [{ translateY: ribbonV.value }] }));
  const ribbonHStyle = useAnimatedStyle(() => ({ opacity: ribbonFade.value, transform: [{ translateX: ribbonH.value }] }));
  const lidStyle = useAnimatedStyle(() => ({ opacity: lidFade.value, transform: [{ translateY: lidY.value }, { rotate: `${lidRot.value}deg` }] }));
  const boxStyle = useAnimatedStyle(() => ({ opacity: boxFade.value, transform: [{ translateY: boxY.value }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintFade.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardFade.value, transform: [{ translateY: cardY.value }, { scale: cardScale.value }] }));
  const amountStyle = useAnimatedStyle(() => ({ transform: [{ scale: amountScale.value }] }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }, { rotate: '18deg' }] }));
  const footerStyle = useAnimatedStyle(() => ({ opacity: footerFade.value }));

  const from = card.from_name ? `FROM ${card.from_name.toUpperCase()}` : 'A GIFT FOR YOU';
  const initials = card.business_name.slice(0, 2).toUpperCase();

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (ready) onDone(); }}>
      <View style={s.root}>
        {/* soft glow in the shop's colour */}
        <LinearGradient colors={[shadeColor(c1, 0.5), '#06251F', '#06251F']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

        <View style={[s.top, { paddingTop: insets.top + 18 }]}>
          <Text style={s.eyebrow}>{from}</Text>
          <Text style={s.title}>{opened ? `${money(card.amount_cents)} at ${card.business_name}` : 'Something for you'}</Text>
        </View>

        <View style={s.stage}>
          {/* ── the card, rising out ── */}
          <Animated.View style={[s.card, { width: CARD_W, height: CARD_H }, cardStyle]} pointerEvents="none">
            <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <Pattern id="dots" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(-14)">
                  <Circle cx="20" cy="20" r="12" stroke="#F7F2E8" strokeWidth="1.2" fill="none" opacity="0.08" />
                </Pattern>
              </Defs>
              <Rect width={CARD_W} height={CARD_H} fill="url(#dots)" />
            </Svg>
            <View style={s.cardHead}>
              <View style={s.logo}>
                {card.logo_url ? (
                  <Image source={{ uri: card.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
                ) : (
                  <Text style={[s.logoInitials, { color: c1 }]}>{initials}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.cardName} numberOfLines={1}>{card.business_name}</Text>
                <Text style={s.cardTag}>GIFT CARD</Text>
              </View>
              <Ionicons name="gift" size={22} color={Colors.gold} />
            </View>
            <Animated.Text style={[s.amount, amountStyle]}>{money(card.amount_cents)}</Animated.Text>
            <Text style={s.cardFor} numberOfLines={1}>
              {card.for_name ? `FOR ${card.for_name.toUpperCase()}` : ''}{card.for_name && card.from_name ? ' · ' : ''}{card.from_name ? `FROM ${card.from_name.toUpperCase()}` : ''}
            </Text>
            {/* one shimmer across the face */}
            <AnimatedGradient
              colors={['rgba(247,242,232,0)', 'rgba(247,242,232,0.22)', 'rgba(247,242,232,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.shimmer, shimmerStyle]}
              pointerEvents="none"
            />
          </Animated.View>

          {/* ── the present ── */}
          <View style={[s.present, { width: BOX_W, height: BOX_H + 70 }]} pointerEvents={opened ? 'none' : 'auto'}>
            <Animated.View style={[s.box, { width: BOX_W, height: BOX_H, top: 70 }, boxStyle]}>
              <LinearGradient colors={[c1, deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Svg width={BOX_W} height={BOX_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <Pattern id="boxdots" patternUnits="userSpaceOnUse" width="44" height="44" patternTransform="rotate(-14)">
                    <Circle cx="22" cy="22" r="13" stroke="#F7F2E8" strokeWidth="1.2" fill="none" opacity="0.07" />
                  </Pattern>
                </Defs>
                <Rect width={BOX_W} height={BOX_H} fill="url(#boxdots)" />
              </Svg>
              {/* ribbons */}
              <Animated.View style={[s.ribbonV, { left: BOX_W / 2 - RIBBON / 2, height: BOX_H }, ribbonVStyle]}>
                <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
              <Animated.View style={[s.ribbonH, { top: BOX_H / 2 - RIBBON / 2, width: BOX_W }, ribbonHStyle]}>
                <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </Animated.View>

            {/* lid */}
            <Animated.View style={[s.lid, { width: BOX_W + 16, top: 50, left: -8, backgroundColor: lidColor }, lidStyle]}>
              <LinearGradient colors={[shadeColor(c1, 0.92), lidColor]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            </Animated.View>

            {/* bow, the tap target */}
            <Pressable onPress={unwrap} style={[s.bowHit, { left: BOX_W / 2 - 55 }]} accessibilityRole="button" accessibilityLabel="Unwrap the gift">
              <Animated.View style={bowStyle}>
                <Bow color={c1} />
              </Animated.View>
            </Pressable>
          </View>
        </View>

        {/* note types itself under the card */}
        <View style={s.noteWrap}>
          {opened && !!card.note && (
            <Text style={s.note}>
              {typed}
              {!ready && <Text style={s.cursor}>|</Text>}
              {ready && card.from_name ? <Text style={s.noteFrom}>  — {card.from_name}</Text> : null}
            </Text>
          )}
        </View>

        <Animated.Text style={[s.hint, hintStyle]}>Tap the bow to unwrap</Animated.Text>

        <Animated.View style={[s.footer, { paddingBottom: insets.bottom + 20 }, footerStyle]} pointerEvents={ready ? 'auto' : 'none'}>
          <Text style={s.footerText}>Added to your gift cards. Show your code at the counter whenever you visit.</Text>
          <TouchableOpacity style={s.btn} onPress={onDone} activeOpacity={0.85}>
            <Text style={s.btnText}>See my card</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06251F' },
  top: { alignItems: 'center', paddingHorizontal: 24, gap: 6 },
  eyebrow: { fontSize: 11, fontFamily: FontFamily.bold, color: Colors.gold, letterSpacing: 1.6 },
  title: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.cream, letterSpacing: -0.4, textAlign: 'center' },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  present: { alignItems: 'center' },
  box: { position: 'absolute', borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.45, shadowRadius: 30, elevation: 14 },
  ribbonV: { position: 'absolute', top: 0, width: RIBBON, overflow: 'hidden' },
  ribbonH: { position: 'absolute', left: 0, height: RIBBON, overflow: 'hidden' },
  lid: { position: 'absolute', height: 42, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 16 },
  bowHit: { position: 'absolute', top: 0, width: 110, height: 90, alignItems: 'center', justifyContent: 'flex-start', zIndex: 5 },

  card: { position: 'absolute', borderRadius: 22, overflow: 'hidden', padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 15, fontFamily: FontFamily.extrabold },
  cardName: { fontSize: 17, fontFamily: FontFamily.extrabold, color: '#fff' },
  cardTag: { fontSize: 10, fontFamily: FontFamily.bold, color: Colors.gold, letterSpacing: 1.4, marginTop: 1 },
  amount: { fontSize: 46, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -1.5, lineHeight: 52, marginTop: 18, alignSelf: 'flex-start' },
  cardFor: { fontSize: 11, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.75)', letterSpacing: 1, marginTop: 8 },
  shimmer: { position: 'absolute', top: -40, bottom: -40, width: 90 },

  noteWrap: { minHeight: 64, paddingHorizontal: 36, justifyContent: 'center' },
  note: { fontSize: 16, fontFamily: FontFamily.regular, fontStyle: 'italic', color: J.cream, textAlign: 'center', lineHeight: 23 },
  noteFrom: { fontStyle: 'normal', fontFamily: FontFamily.bold, color: Colors.gold },
  cursor: { color: Colors.gold, fontFamily: FontFamily.regular },

  hint: { position: 'absolute', bottom: 140, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontFamily: FontFamily.semibold, color: 'rgba(247,242,232,0.6)' },
  footer: { paddingHorizontal: 24, gap: 14 },
  footerText: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(247,242,232,0.7)', textAlign: 'center', lineHeight: 19 },
  btn: { height: 54, borderRadius: 27, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontFamily: FontFamily.extrabold, color: '#0C2E29' },
});
