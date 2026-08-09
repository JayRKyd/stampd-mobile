import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FontFamily, Palette as J } from '@/constants/theme';

// First-run walkthrough: dims the screen and cuts a rounded spotlight around
// one element at a time, with a tooltip card explaining it. Every step can be
// skipped; finishing or skipping never shows it again (caller owns the flag).

export type CoachStep = {
  title: string;
  body: string;
  rect: { x: number; y: number; width: number; height: number };
};

const PAD = 8;          // breathing room around the highlighted element
const HOLE_RADIUS = 18; // matches the app's card radii closely enough
const { width: W, height: H } = Dimensions.get('window');

// Full-screen rect with a rounded-rect hole, via even-odd fill.
function maskPath(r: CoachStep['rect'], pad: number): string {
  const x = r.x - pad;
  const y = r.y - pad;
  const w = r.width + pad * 2;
  const h = r.height + pad * 2;
  const rad = Math.min(HOLE_RADIUS + Math.max(pad - PAD, 0), w / 2, h / 2);
  return (
    `M0 0H${W}V${H}H0Z ` +
    `M${x + rad} ${y}` +
    `H${x + w - rad}A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}` +
    `V${y + h - rad}A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}` +
    `H${x + rad}A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}` +
    `V${y + rad}A${rad} ${rad} 0 0 1 ${x + rad} ${y}Z`
  );
}

export function CoachMarks({
  steps,
  onDone,
}: {
  steps: CoachStep[];
  onDone: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;

  const last = index === steps.length - 1;

  // Tooltip goes below the spotlight when there's room, otherwise above.
  const holeBottom = step.rect.y + step.rect.height + PAD;
  const holeTop = step.rect.y - PAD;
  const below = holeBottom + 190 < H;
  const cardPos = below ? { top: holeBottom + 14 } : { bottom: H - holeTop + 14 };

  return (
    <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={() => onDone(false)}>
      <View style={s.root}>
        {/* Two stacked dim layers with offset holes feather the spotlight
            edge: full dim outside both holes, half dim in the 10px rim. */}
        <Svg width={W} height={H} style={StyleSheet.absoluteFillObject}>
          <Path d={maskPath(step.rect, PAD + 10)} fill="rgba(10,20,19,0.48)" fillRule="evenodd" />
          <Path d={maskPath(step.rect, PAD)} fill="rgba(10,20,19,0.48)" fillRule="evenodd" />
        </Svg>

        <View style={[s.card, cardPos]}>
          <View style={s.dotsRow}>
            {steps.map((_, i) => (
              <View key={i} style={[s.dot, i === index && s.dotActive]} />
            ))}
          </View>
          <Text style={s.title}>{step.title}</Text>
          <Text style={s.body}>{step.body}</Text>
          <View style={s.btnRow}>
            <TouchableOpacity onPress={() => onDone(false)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.skip}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => (last ? onDone(true) : setIndex(index + 1))}
              activeOpacity={0.85}
            >
              <Text style={s.nextText}>{last ? 'Got it' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
  },
  dotsRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: J.lineSoft },
  dotActive: { backgroundColor: J.teal, width: 16 },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  body: {
    fontSize: 13.5,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 20,
    marginBottom: 14,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.inkSoft },
  nextBtn: {
    backgroundColor: J.teal,
    borderRadius: 18,
    paddingHorizontal: 22,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { fontSize: 13.5, fontFamily: FontFamily.bold, color: '#fff' },
});
