import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

export default function PhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) { setError('Enter a valid phone number'); return; }
    setLoading(true);
    const fullPhone = `+1${digits}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    if (error) { setError(error.message); setLoading(false); return; }
    router.navigate({ pathname: '/(auth)/verify', params: { phone: fullPhone } });
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={J.teal} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Your number</Text>
        <View style={s.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.title}>What's your number?</Text>
        <Text style={s.sub}>We'll text you a verification code. No spam, ever.</Text>

        <View style={[s.inputGroup, error ? s.inputGroupError : null]}>
          <View style={s.dialBox}>
            <Text style={s.dialCode}>+1</Text>
          </View>
          <View style={s.inputDivider} />
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={(t) => { setPhone(formatPhone(t)); setError(''); }}
            placeholder="(242) 000-0000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            maxLength={14}
            autoFocus
          />
        </View>

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={s.hint}>
          Your number is your Stampd identity — merchants can also stamp you by number if you prefer not to share your PIN.
        </Text>

        <TouchableOpacity
          style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
          onPress={handleSend}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>{loading ? 'Sending…' : 'Send Code'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },

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

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },

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
    lineHeight: 20,
    marginBottom: 24,
  },

  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.10)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  inputGroupError: { borderColor: Colors.danger },
  dialBox: { paddingHorizontal: 16, height: 54, alignItems: 'center', justifyContent: 'center' },
  dialCode: { fontSize: 15, fontFamily: FontFamily.bold, color: J.teal },
  inputDivider: { width: 1, height: 26, backgroundColor: 'rgba(0,0,0,0.08)' },
  input: {
    flex: 1,
    height: 54,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: J.ink,
  },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingHorizontal: 4 },
  errorText: { flex: 1, fontSize: 12, fontFamily: FontFamily.medium, color: Colors.danger },

  hint: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 4,
  },

  primaryBtn: {
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 40,
    backgroundColor: J.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },
});
