import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WEB_URL } from '@/lib/webLinks';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email: initialEmail } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const cleaned = email.trim();
    if (!cleaned || !cleaned.includes('@')) {
      setError('Enter the email you signed up with');
      return;
    }
    setLoading(true);
    setError('');
    // Without an explicit redirect the link lands on the site root, where the
    // token is consumed silently and no reset form ever appears
    const { error } = await supabase.auth.resetPasswordForEmail(cleaned, {
      redirectTo: `${WEB_URL}/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
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
        <Text style={s.topBarTitle}>Reset password</Text>
        <View style={s.topBarSpacer} />
      </View>

      {sent ? (
        <View style={s.sentWrap}>
          <View style={s.sentIconBox}>
            <Ionicons name="mail-outline" size={30} color={J.teal} />
          </View>
          <Text style={s.sentTitle}>Check your email</Text>
          <Text style={s.sentSub}>
            We sent a password reset link to{'\n'}
            <Text style={s.sentEmail}>{email.trim()}</Text>
          </Text>
          <Text style={s.sentHint}>
            Open the link to set a new password, then come back and sign in.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.content}>
          <Text style={s.title}>Forgot your password?</Text>
          <Text style={s.sub}>
            No stress — enter your email and we'll send you a link to set a new one.
          </Text>

          <View style={[s.inputGroup, error ? s.inputGroupError : null]}>
            <TextInput
              style={s.inputRow}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
            />
          </View>

          {error ? (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
            onPress={handleSend}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>{loading ? 'Sending…' : 'Send Reset Link'}</Text>
          </TouchableOpacity>
        </View>
      )}
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
    lineHeight: 20,
    marginBottom: 24,
  },

  inputGroup: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.10)',
    marginBottom: 14,
    overflow: 'hidden',
  },
  inputGroupError: { borderColor: Colors.danger },
  inputRow: {
    height: 54,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: J.ink,
  },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingHorizontal: 4 },
  errorText: { flex: 1, fontSize: 12, fontFamily: FontFamily.medium, color: Colors.danger },

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

  sentWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  sentIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(0,96,90,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,96,90,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  sentTitle: { fontSize: 24, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.5 },
  sentSub: { fontSize: 14, fontFamily: FontFamily.regular, color: J.inkSoft, textAlign: 'center', lineHeight: 22 },
  sentEmail: { fontFamily: FontFamily.bold, color: J.teal },
  sentHint: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, textAlign: 'center', lineHeight: 19 },
});
