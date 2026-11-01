import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSpring, withDelay, withSequence,
  Easing, cancelAnimation, runOnJS, interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect, Path, LinearGradient as SvgGradient, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { cardGradient, shadeColor } from '@/lib/cardColor';
import { GiftCard, money } from '@/lib/giftCards';

// The reveal. Shown once, right after a gift card is claimed. The card
// arrives face down, sealed with a gold wax seal. Hold the seal, it cracks,
// the card flips over, the amount lands, and the note types itself.
// The same role the golden ticket plays for a finished stamp card.

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(330, SCREEN_W - 48);
const CARD_H = Math.round(CARD_W * 0.62);
const SEAL = 104;
const HOLD_MS = 650;

const STAGE = '#0E1513';
const GOLD = { light: '#f2dc8c', mid: '#d4a843', deep: '#a67f22', dark: '#7d5f16' };

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = SEAL / 2 + 12;
const RING_C = 2 * Math.PI * RING_R;

// A wax seal: a slightly uneven gold disc with a pressed Stampd mark.
function Seal({ size }: { size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 104 104">
      <Defs>
        <RadialGradient id="wax" cx="38%" cy="32%" rx="70%" ry="70%">
          <Stop offset="0" stopColor={GOLD.light} />
          <Stop offset="0.5" stopColor={GOLD.mid} />
          <Stop offset="1" stopColor={GOLD.deep} />
        </RadialGradient>
        <RadialGradient id="press" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.72" stopColor={GOLD.dark} stopOpacity="0" />
          <Stop offset="1" stopColor={GOLD.dark} stopOpacity="0.55" />
        </RadialGradient>
      </Defs>
      {/* the wax, edge gently uneven */}
      <Path
        d="M52 3 C 66 2, 78 6, 87 16 C 97 26, 102 40, 100 54 C 99 68, 92 82, 80 91 C 68 100, 50 103, 36 98 C 20 93, 8 80, 4 64 C 0 48, 4 30, 15 18 C 25 8, 38 4, 52 3 Z"
        fill="url(#wax)"
      />
      <Path
        d="M52 3 C 66 2, 78 6, 87 16 C 97 26, 102 40, 100 54 C 99 68, 92 82, 80 91 C 68 100, 50 103, 36 98 C 20 93, 8 80, 4 64 C 0 48, 4 30, 15 18 C 25 8, 38 4, 52 3 Z"
        fill="url(#press)"
      />
      {/* pressed ring and mark */}
      <Circle cx="52" cy="52" r="34" fill="none" stroke={GOLD.dark} strokeWidth="2.2" opacity="0.55" />
      <Circle cx="52" cy="52" r="34" fill="none" stroke={GOLD.light} strokeWidth="1" opacity="0.5" transform="translate(0,1.5)" />
      <SvgText x="52" y="66" fontSize="40" fontWeight="800" fontFamily="PlusJakartaSans_800ExtraBold" textAnchor="middle" fill={GOLD.dark} opacity="0.75">S</SvgText>
      <SvgText x="52" y="64.5" fontSize="40" fontWeight="800" fontFamily="PlusJakartaSans_800ExtraBold" textAnchor="middle" fill={GOLD.light} opacity="0.35">S</SvgText>
      <Circle cx="38" cy="30" r="10" fill="#fff" opacity="0.12" />
      {/* silence unused var warnings for r */}
      <Circle cx={r} cy={r} r="0" />
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
                <Defs>
                  <Pattern id="backdots" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(-14)">
                    <Circle cx="20" cy="20" r="12" stroke="#F7F2E8" strokeWidth="1.2" fill="none" opacity="0.07" />
                  </Pattern>
                </Defs>
                <Rect width={CARD_W} height={CARD_H} fill="url(#backdots)" />
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
                        <Path d="M52 4 L48 22 L56 38 L47 56 L55 72 L49 88 L52 100" stroke="#2a1d05" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
              <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <Pattern id="frontdots" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(-14)">
                    <Circle cx="20" cy="20" r="12" stroke="#F7F2E8" strokeWidth="1.2" fill="none" opacity="0.08" />
                  </Pattern>
                </Defs>
                <Rect width={CARD_W} height={CARD_H} fill="url(#frontdots)" />
              </Svg>
              <View style={s.cardInner}>
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
              </View>
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
