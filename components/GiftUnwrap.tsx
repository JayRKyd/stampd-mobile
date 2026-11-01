import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSpring, withDelay, withSequence,
  Easing, cancelAnimation, runOnJS, interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect, Path, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { GiftCard, money } from '@/lib/giftCards';
import { GiftCardFace, GIFT_FACE_RATIO } from '@/components/GiftCardFace';

// The reveal. Shown once, right after a gift card is claimed. The card
// arrives face down, sealed with a gold wax seal. Hold the seal, it cracks,
// the card flips over, the amount lands, and the note types itself.
// The same role the golden ticket plays for a finished stamp card.

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(330, SCREEN_W - 48);
const CARD_H = Math.round(CARD_W * GIFT_FACE_RATIO);
const SEAL = 104;
const HOLD_MS = 650;

const STAGE = '#0E1513';
const GOLD = { light: '#f2dc8c', mid: '#d4a843', deep: '#a67f22', dark: '#7d5f16' };

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = SEAL / 2 + 12;
const RING_C = 2 * Math.PI * RING_R;

// A wax seal. Matte antique gold, a little thickness at the edge, a recessed
// impression with the Stampd mark (the four dots) pressed into it.
const WAX = { light: '#cdb264', mid: '#ab8a37', deep: '#7f6424', dark: '#56420f' };
const BLOB = 'M52 3 C 66 2, 78 6, 87 16 C 97 26, 102 40, 100 54 C 99 68, 92 82, 80 91 C 68 100, 50 103, 36 98 C 20 93, 8 80, 4 64 C 0 48, 4 30, 15 18 C 25 8, 38 4, 52 3 Z';

function Seal({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 104 104">
      <Defs>
        <SvgGradient id="waxFace" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={WAX.light} />
          <Stop offset="0.55" stopColor={WAX.mid} />
          <Stop offset="1" stopColor={WAX.deep} />
        </SvgGradient>
        <SvgGradient id="waxWell" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={WAX.deep} />
          <Stop offset="1" stopColor={WAX.mid} />
        </SvgGradient>
        <RadialGradient id="waxVignette" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.7" stopColor={WAX.dark} stopOpacity="0" />
          <Stop offset="1" stopColor={WAX.dark} stopOpacity="0.5" />
        </RadialGradient>
      </Defs>
      {/* thickness: the same shape, lower and darker */}
      <Path d={BLOB} fill={WAX.dark} transform="translate(0,3)" />
      {/* the face */}
      <Path d={BLOB} fill="url(#waxFace)" />
      <Path d={BLOB} fill="url(#waxVignette)" />
      {/* the impression: a recessed well with a dark upper lip and a light lower lip */}
      <Circle cx="52" cy="52" r="33" fill="url(#waxWell)" />
      <Circle cx="52" cy="52" r="33" fill="none" stroke={WAX.dark} strokeWidth="1.6" opacity="0.7" />
      <Circle cx="52" cy="53.5" r="33" fill="none" stroke={WAX.light} strokeWidth="1" opacity="0.45" />
      <Circle cx="52" cy="52" r="27" fill="none" stroke={WAX.dark} strokeWidth="0.8" opacity="0.4" />
      {/* the mark: four dots, pressed in (dark dot, light edge beneath) */}
      <Circle cx="44" cy="44" r="5" fill={WAX.light} opacity="0.45" transform="translate(0,1.4)" />
      <Circle cx="60" cy="44" r="5" fill={WAX.light} opacity="0.45" transform="translate(0,1.4)" />
      <Circle cx="44" cy="60" r="5" fill={WAX.light} opacity="0.45" transform="translate(0,1.4)" />
      <Circle cx="60" cy="60" r="5" fill={WAX.light} opacity="0.45" transform="translate(0,1.4)" />
      <Circle cx="44" cy="44" r="5" fill={WAX.dark} opacity="0.85" />
      <Circle cx="60" cy="44" r="5" fill={WAX.dark} opacity="0.85" />
      <Circle cx="44" cy="60" r="5" fill={WAX.dark} opacity="0.85" />
      <Circle cx="60" cy="60" r="5" fill={WAX.dark} opacity="0.85" />
      {/* a soft matte light along the top edge, nothing glossy */}
      <Path d="M18 20 C 28 10, 40 6, 52 5" stroke={WAX.light} strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
    </Svg>
  );
}

export function GiftUnwrap({ card, visible, onDone }: { card: GiftCard; visible: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState(false);
  const [typed, setTyped] = useState('');
  const [ready, setReady] = useState(false);
  const typer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [c1, c2] = cardGradient(card.card_color, 0);
  const backDeep = shadeColor(c1, 0.55);

  // hold ring + seal
  const hold = useSharedValue(0);          // 0..1 while pressing
  const sealScale = useSharedValue(1);
  const sealLeftX = useSharedValue(0);
  const sealRightX = useSharedValue(0);
  const sealRot = useSharedValue(0);
  const sealFade = useSharedValue(1);
  const crack = useSharedValue(0);
  const hintFade = useSharedValue(1);
  // flip
  const rot = useSharedValue(0);           // 0 = back showing, 180 = front
  const lift = useSharedValue(0);
  const amountScale = useSharedValue(0.6);
  const shimmerX = useSharedValue(-CARD_W);
  const footerFade = useSharedValue(0);

  useEffect(() => () => { if (typer.current) clearInterval(typer.current); if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

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

  const breakSeal = () => {
    if (opened) return;
    setOpened(true);
    hintFade.value = withTiming(0, { duration: 160 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    // the seal cracks: a line appears, the halves part and fall away
    crack.value = withTiming(1, { duration: 140 });
    sealScale.value = withSequence(withTiming(1.08, { duration: 120 }), withTiming(1, { duration: 120 }));
    sealLeftX.value = withDelay(180, withTiming(-26, { duration: 420, easing: Easing.out(Easing.cubic) }));
    sealRightX.value = withDelay(180, withTiming(26, { duration: 420, easing: Easing.out(Easing.cubic) }));
    sealRot.value = withDelay(180, withTiming(14, { duration: 420, easing: Easing.out(Easing.cubic) }));
    sealFade.value = withDelay(300, withTiming(0, { duration: 320 }));

    // the card lifts and flips over
    lift.value = withDelay(420, withSequence(
      withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
    ));
    rot.value = withDelay(420, withTiming(180, { duration: 780, easing: Easing.inOut(Easing.cubic) }, (done) => {
      if (done) runOnJS(afterFlip)();
    }));
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 820);
  };

  const afterFlip = () => {
    amountScale.value = withSpring(1, { damping: 11, stiffness: 180 }, (done) => { if (done) runOnJS(startTyping)(); });
    shimmerX.value = withDelay(200, withTiming(CARD_W * 1.4, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 120);
  };

  const onPressIn = () => {
    if (opened) return;
    Haptics.selectionAsync().catch(() => {});
    hold.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    sealScale.value = withTiming(0.96, { duration: HOLD_MS });
    holdTimer.current = setTimeout(breakSeal, HOLD_MS);
  };
  const onPressOut = () => {
    if (opened) return;
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    cancelAnimation(hold);
    hold.value = withTiming(0, { duration: 200 });
    sealScale.value = withTiming(1, { duration: 200 });
  };

  useEffect(() => {
    if (ready) footerFade.value = withTiming(1, { duration: 360 });
  }, [ready, footerFade]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - hold.value) }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: hold.value > 0.02 ? 1 : 0 }));
  const sealWrapStyle = useAnimatedStyle(() => ({ opacity: sealFade.value, transform: [{ scale: sealScale.value }] }));
  const sealLeftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sealLeftX.value }, { rotate: `${-sealRot.value}deg` }] }));
  const sealRightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sealRightX.value }, { rotate: `${sealRot.value}deg` }] }));
  const crackStyle = useAnimatedStyle(() => ({ opacity: crack.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintFade.value }));
  const cardWrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 26 }, { scale: 1 + lift.value * 0.06 }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rot.value}deg` }],
    opacity: rot.value < 90 ? 1 : 0,
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rot.value + 180}deg` }],
    opacity: rot.value >= 90 ? 1 : 0,
  }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: interpolate(rot.value, [0, 90, 180], [0, 0.35, 0]) }));
  const amountStyle = useAnimatedStyle(() => ({ transform: [{ scale: amountScale.value }] }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }, { rotate: '18deg' }] }));
  const footerStyle = useAnimatedStyle(() => ({ opacity: footerFade.value }));

  const from = card.from_name ? `FROM ${card.from_name.toUpperCase()}` : 'A GIFT FOR YOU';
  const initials = card.business_name.slice(0, 2).toUpperCase();

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (ready) onDone(); }}>
      <View style={s.root}>
        <Svg width={SCREEN_W} height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="46%" rx="60%" ry="42%">
              <Stop offset="0" stopColor={GOLD.mid} stopOpacity="0.2" />
              <Stop offset="0.6" stopColor={GOLD.mid} stopOpacity="0.05" />
              <Stop offset="1" stopColor={STAGE} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>

        <View style={[s.top, { paddingTop: insets.top + 18 }]}>
          <Text style={s.eyebrow}>{from}</Text>
          <Text style={s.title}>{opened ? `${money(card.amount_cents)} at ${card.business_name}` : 'Something for you'}</Text>
        </View>

        <View style={s.stage}>
          <Animated.View style={[{ width: CARD_W, height: CARD_H }, cardWrapStyle]}>

            {/* ── back: shop colour, sealed ── */}
            <Animated.View style={[s.face, backStyle]}>
              <LinearGradient colors={[c1, backDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Rect x="10" y="10" width={CARD_W - 20} height={CARD_H - 20} rx="16" fill="none" stroke="#F7F2E8" strokeWidth="1" opacity="0.18" />
              </Svg>
              <Text style={s.backShop} numberOfLines={1}>{card.business_name.toUpperCase()}</Text>
              <View style={s.sealArea}>
                {/* hold ring */}
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, ringStyle]} pointerEvents="none">
                  <Svg width={RING_R * 2 + 6} height={RING_R * 2 + 6}>
                    <AnimatedCircle
                      cx={RING_R + 3} cy={RING_R + 3} r={RING_R}
                      stroke={GOLD.light} strokeWidth="2.5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${RING_C} ${RING_C}`}
                      animatedProps={ringProps}
                      transform={`rotate(-90 ${RING_R + 3} ${RING_R + 3})`}
                    />
                  </Svg>
                </Animated.View>
                <Pressable onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel="Hold to break the seal" style={s.sealHit}>
                  <Animated.View style={[s.sealWrap, sealWrapStyle]}>
                    {/* left and right halves, clipped, so the seal can split */}
                    <Animated.View style={[s.half, { left: 0 }, sealLeftStyle]}>
                      <View style={{ width: SEAL, height: SEAL }}><Seal size={SEAL} /></View>
                    </Animated.View>
                    <Animated.View style={[s.half, { left: SEAL / 2 }, sealRightStyle]}>
                      <View style={{ width: SEAL, height: SEAL, marginLeft: -SEAL / 2 }}><Seal size={SEAL} /></View>
                    </Animated.View>
                    <Animated.View style={[s.crack, crackStyle]} pointerEvents="none">
                      <Svg width={SEAL} height={SEAL} viewBox="0 0 104 104">
                        <Path d="M52 4 L48 22 L56 38 L47 56 L55 72 L49 88 L52 100" stroke="#2a1d05" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <Path d="M52 4 L48 22 L56 38 L47 56 L55 72 L49 88 L52 100" stroke={WAX.light} strokeWidth="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" transform="translate(1.2,0)" />
                      </Svg>
                    </Animated.View>
                  </Animated.View>
                </Pressable>
              </View>
              <Text style={s.backFor} numberOfLines={1}>{card.for_name ? `FOR ${card.for_name.toUpperCase()}` : 'GIFT CARD'}</Text>
              {/* edge shade during the flip */}
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shadeStyle]} pointerEvents="none" />
            </Animated.View>

            {/* ── front: the card ── */}
            <Animated.View style={[s.face, frontStyle]} pointerEvents="none">
              <GiftCardFace card={card} width={CARD_W} amountAnimatedStyle={amountStyle} style={{ shadowOpacity: 0, elevation: 0 }} />
              <AnimatedGradient
                colors={['rgba(247,242,232,0)', 'rgba(247,242,232,0.22)', 'rgba(247,242,232,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.shimmer, shimmerStyle]}
                pointerEvents="none"
              />
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shadeStyle]} pointerEvents="none" />
            </Animated.View>
          </Animated.View>
        </View>

        <View style={s.noteWrap}>
          {opened && !!card.note && (
            <Text style={s.note}>
              {typed}
              {!ready && <Text style={s.cursor}>|</Text>}
              {ready && card.from_name ? <Text style={s.noteFrom}>  — {card.from_name}</Text> : null}
            </Text>
          )}
        </View>

        <Animated.Text style={[s.hint, hintStyle]}>Hold the seal to open</Animated.Text>

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
  root: { flex: 1, backgroundColor: STAGE },
  top: { alignItems: 'center', paddingHorizontal: 24, gap: 6 },
  eyebrow: { fontSize: 11, fontFamily: FontFamily.bold, color: Colors.gold, letterSpacing: 1.6 },
  title: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.cream, letterSpacing: -0.4, textAlign: 'center' },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  face: {
    ...StyleSheet.absoluteFillObject, borderRadius: 22, overflow: 'hidden', backfaceVisibility: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.55, shadowRadius: 30, elevation: 18,
  },

  // back
  backShop: { position: 'absolute', top: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontFamily: FontFamily.bold, color: 'rgba(247,242,232,0.7)', letterSpacing: 2 },
  backFor: { position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontFamily: FontFamily.bold, color: Colors.gold, letterSpacing: 2 },
  sealArea: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  sealHit: { width: SEAL + 40, height: SEAL + 40, alignItems: 'center', justifyContent: 'center' },
  sealWrap: { width: SEAL, height: SEAL, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  half: { position: 'absolute', top: 0, width: SEAL / 2, height: SEAL, overflow: 'hidden' },
  crack: { position: 'absolute', top: 0, left: 0, width: SEAL, height: SEAL },

  // front
  cardInner: { flex: 1, padding: 20 },
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

  hint: { position: 'absolute', bottom: 140, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontFamily: FontFamily.semibold, color: 'rgba(247,242,232,0.55)' },
  footer: { paddingHorizontal: 24, gap: 14 },
  footerText: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(247,242,232,0.7)', textAlign: 'center', lineHeight: 19 },
  btn: { height: 54, borderRadius: 27, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontFamily: FontFamily.extrabold, color: '#0C2E29' },
});
