import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(30);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (timer > 0) { const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); }
  }, [timer]);

  async function verify(otp: string) {
    if (otp.length !== 6) return;
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (error) { setError('Invalid code. Try again.'); setCode(''); setLoading(false); return; }
    if (data.user) {
      const { data: existing } = await supabase.from('users').select('id').eq('id', data.user.id).single();
      if (!existing) await supabase.from('users').insert({ id: data.user.id, phone, phone_verified: true });
    }
    router.replace('/(tabs)');
  }

  function onChange(val: string) {
    const d = val.replace(/\D/g, '').slice(0, 6);
    setCode(d); setError('');
    if (d.length === 6) verify(d);
  }

  const cells = Array.from({ length: 6 }, (_, i) => code[i] || '');

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TextInput ref={inputRef} style={s.hidden} value={code} onChangeText={onChange} keyboardType="number-pad" maxLength={6} autoFocus />

      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={J.teal} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Verify</Text>
        <View style={s.topBarSpacer} />
      </View>

      <View style={s.content}>
        <Text style={s.title}>Check your messages</Text>
        <Text style={s.sub}>
          We sent a 6-digit code to{'\n'}
          <Text style={s.phoneHL}>{phone}</Text>
        </Text>

        <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()}>
          <View style={s.cellRow}>
            {cells.map((d, i) => (
              <View key={i} style={[s.cell, d ? s.cellFilled : null, code.length === i && s.cellActive, error ? s.cellError : null]}>
                <Text style={s.cellText}>{d}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.resendRow}>
          <Text style={s.resendLabel}>Didn't get the code? </Text>
          {timer > 0
            ? <Text style={s.resendTimer}>Resend in {timer}s</Text>
            : <TouchableOpacity onPress={() => { supabase.auth.signInWithOtp({ phone }); setTimer(30); setCode(''); }}>
                <Text style={s.resendBtn}>Resend</Text>
              </TouchableOpacity>
          }
        </View>

        <TouchableOpacity
          style={[s.primaryBtn, (code.length < 6 || loading) && s.primaryBtnDisabled]}
          onPress={() => verify(code)}
          disabled={code.length < 6 || loading}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>{loading ? 'Verifying…' : 'Verify'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },
  hidden: { position: 'absolute', opacity: 0, width: 0, height: 0 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: J.ink,
  },
  topBarSpacer: { width: 38 },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28 },

  title: {
    fontSize: 26,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 21,
    marginBottom: 28,
  },
  phoneHL: { fontFamily: FontFamily.bold, color: J.teal },

  cellRow: { flexDirection: 'row', gap: 8, marginBottom: 18, justifyContent: 'center' },
  cell: {
    width: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: J.teal, backgroundColor: 'rgba(0,96,90,0.06)' },
  cellActive: { borderColor: J.teal, borderWidth: 2 },
  cellError: { borderColor: Colors.danger, backgroundColor: Colors.dangerMuted },
  cellText: { fontSize: 22, fontFamily: FontFamily.extrabold, color: J.ink },

  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 },
  errorText: { fontSize: 13, fontFamily: FontFamily.medium, color: Colors.danger },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 32, marginTop: 4 },
  resendLabel: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft },
  resendTimer: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.inkSoft },
  resendBtn: { fontSize: 13, fontFamily: FontFamily.bold, color: J.teal },

  primaryBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: J.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },
});
