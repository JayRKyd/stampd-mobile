import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      {/* Background photo over a teal base (base shows if the image ever fails) */}
      <LinearGradient
        colors={['#0B4A45', '#04302C', '#02120F']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={s.bgClip}>
        <Image
          source={require('../../assets/welcome.jpg')}
          style={s.bgImage}
          resizeMode="cover"
        />
      </View>

      {/* Legibility scrims — light at the top for the wordmark, heavy at the
          bottom where the headline and buttons sit */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={s.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.82)']}
        style={s.scrim}
        pointerEvents="none"
      />

      <View style={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <Text style={s.wordmark}>Stampd</Text>

        <View style={{ flex: 1 }} />

        <Text style={s.headline}>
          Full price?{'\n'}
          <Text style={s.headlineGold}>Every visit?</Text>
        </Text>
        <Text style={s.sub}>
          We turn your loyalty into free stuff at the local spots you already love.
        </Text>
        <Text style={s.sub2}>One PIN. Every shop.</Text>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.btnPrimary}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signup' } })}
            activeOpacity={0.9}
          >
            <Text style={s.btnPrimaryText}>Sign up</Text>
            <View style={s.btnPrimaryArrow}>
              <Ionicons name="arrow-forward" size={14} color={J.cream} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signin' } })}
            activeOpacity={0.9}
          >
            <Text style={s.btnSecondaryText}>Sign in</Text>
            <View style={s.btnSecondaryArrow}>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <Text style={s.terms}>Free for customers · No credit card needed</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02120F' },

  // Clip + offset so cover anchors on the counter scene, not the ceiling.
  bgClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgImage: {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: '115%',
    top: '-15%',
  },

  scrimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 140,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },

  content: { flex: 1, paddingHorizontal: 24 },
  wordmark: {
    fontSize: 22,
    fontFamily: FontFamily.extrabold,
    color: J.cream,
    letterSpacing: -0.5,
  },

  headline: {
    fontSize: 42,
    fontFamily: FontFamily.extrabold,
    color: J.cream,
    letterSpacing: -1.2,
    lineHeight: 48,
  },
  headlineGold: { color: Colors.gold },
  sub: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 320,
  },
  sub2: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: J.cream,
    marginTop: 12,
  },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  btnPrimary: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: J.cream,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnPrimaryText: { fontSize: 16, fontFamily: FontFamily.extrabold, color: J.ink },
  btnPrimaryArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: J.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnSecondaryText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },
  btnSecondaryArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  terms: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
  },
});
