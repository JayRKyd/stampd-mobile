import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WEB_URL } from '@/lib/webLinks';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

const TERMS_VERSION = '1.0';
const PRIVACY_VERSION = '1.0';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode: initialMode, authError } = useLocalSearchParams<{ mode?: string; authError?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode === 'signup' ? 'signup' : 'signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(authError ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  async function handleSubmit() {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter your first and last name');
        return;
      }
      if (!legalAccepted) {
        setError('Please accept the Terms of Service and acknowledge the Privacy Policy');
        return;
      }
    }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');

    if (mode === 'signup') {
      const acceptedAt = new Date().toISOString();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${WEB_URL}/confirmed`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            terms_accepted_at: acceptedAt,
            terms_version: TERMS_VERSION,
            privacy_acknowledged_at: acceptedAt,
            privacy_policy_version: PRIVACY_VERSION,
          },
        },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data.user && !data.session) {
        setConfirmed(true);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
    }

    setLoading(false);
    router.replace('/(tabs)');
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setLegalAccepted(false);
    setError('');
  }

  async function openLegalDocument(label: string, url?: string) {
    if (!url) {
      setError(`${label} link will be available soon`);
      return;
    }
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      setError(`Could not open the ${label.toLowerCase()}`);
      return;
    }
    await Linking.openURL(url);
  }

  const TopBar = (
    <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={s.backBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={J.teal} />
      </TouchableOpacity>
      <Text style={s.topBarTitle}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
      <View style={s.topBarSpacer} />
    </View>
  );

  if (confirmed) {
    return (
      <View style={s.root}>
        {TopBar}
        <View style={s.confirmedWrap}>
          <View style={s.confirmedIconBox}>
            <Ionicons name="mail-outline" size={30} color={J.teal} />
          </View>
          <Text style={s.confirmedTitle}>Check your email</Text>
          <Text style={s.confirmedSub}>
            We sent a confirmation link to{'\n'}
            <Text style={s.confirmedEmail}>{email}</Text>
          </Text>
          <Text style={s.confirmedHint}>Open the link, then come back and sign in.</Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => { setConfirmed(false); setMode('signin'); }}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {TopBar}
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>
          {mode === 'signin' ? 'Welcome back' : 'Welcome to Stampd'}
        </Text>
        <Text style={s.sub}>
          {mode === 'signin'
            ? 'Your wallet missed you.'
            : 'A minute from now you\'ll be collecting stamps.'}
        </Text>

        {/* Name group (signup only) */}
        {mode === 'signup' && (
          <View style={s.inputGroup}>
            <TextInput
              style={s.inputRow}
              value={firstName}
              onChangeText={(t) => { setFirstName(t); setError(''); }}
              placeholder="First name"
              placeholderTextColor={Colors.textMuted}
              autoComplete="given-name"
              autoCapitalize="words"
            />
            <View style={s.inputDivider} />
            <TextInput
              style={s.inputRow}
              value={lastName}
              onChangeText={(t) => { setLastName(t); setError(''); }}
              placeholder="Last name"
              placeholderTextColor={Colors.textMuted}
              autoComplete="family-name"
              autoCapitalize="words"
            />
          </View>
        )}

        {/* Credentials group */}
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
          />
          <View style={s.inputDivider} />
          <View style={s.passwordRow}>
            <TextInput
              style={s.passwordInput}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {mode === 'signin' && (
          <TouchableOpacity
            style={s.forgotLink}
            onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: email ? { email } : undefined })}
            activeOpacity={0.7}
          >
            <Text style={s.forgotLinkText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {mode === 'signup' && (
          <View style={s.legalRow}>
            <TouchableOpacity
              style={[s.checkbox, legalAccepted && s.checkboxChecked]}
              onPress={() => { setLegalAccepted(value => !value); setError(''); }}
              activeOpacity={0.75}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: legalAccepted }}
              accessibilityLabel="Agree to the Terms of Service and acknowledge the Privacy Policy"
            >
              {legalAccepted && <Ionicons name="checkmark" size={15} color="#fff" />}
            </TouchableOpacity>
            <View style={s.legalCopy}>
              <Text style={s.legalText}>I agree to the </Text>
              <TouchableOpacity onPress={() => openLegalDocument('Terms of Service', TERMS_URL)}>
                <Text style={s.legalLink}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={s.legalText}> and acknowledge the </Text>
              <TouchableOpacity onPress={() => openLegalDocument('Privacy Policy', PRIVACY_URL)}>
                <Text style={s.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={s.legalText}>.</Text>
            </View>
          </View>
        )}

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.primaryBtn, (loading || (mode === 'signup' && !legalAccepted)) && s.primaryBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading || (mode === 'signup' && !legalAccepted)}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>
            {loading ? 'Please wait…' : 'Continue'}
          </Text>
        </TouchableOpacity>

        {/* or divider */}
        <View style={s.orRow}>
          <View style={s.orLine} />
          <Text style={s.orText}>or</Text>
          <View style={s.orLine} />
        </View>

        {/* Switch-mode option, Airbnb style */}
        <TouchableOpacity style={s.optionBtn} onPress={switchMode} activeOpacity={0.8}>
          <Ionicons
            name={mode === 'signin' ? 'person-add-outline' : 'log-in-outline'}
            size={17}
            color={J.ink}
            style={s.optionIcon}
          />
          <Text style={s.optionText}>
            {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
          </Text>
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

  // Grouped inputs, Airbnb style — one bordered stack with hairline dividers
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
  inputDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 16 },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  passwordInput: {
    flex: 1,
    height: 54,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: J.ink,
  },

  forgotLink: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 14, paddingVertical: 4 },
  forgotLinkText: { fontSize: 13, fontFamily: FontFamily.semibold, color: J.teal },

  legalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.22)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: J.teal, borderColor: J.teal },
  legalCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  legalText: { fontSize: 12, lineHeight: 19, fontFamily: FontFamily.regular, color: J.inkSoft },
  legalLink: {
    fontSize: 12,
    lineHeight: 19,
    fontFamily: FontFamily.semibold,
    color: J.teal,
    textDecorationLine: 'underline',
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

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  orText: { fontSize: 12, fontFamily: FontFamily.medium, color: J.inkSoft },

  optionBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIcon: { position: 'absolute', left: 20 },
  optionText: { fontSize: 15, fontFamily: FontFamily.semibold, color: J.ink },

  // Confirmed (check your email)
  confirmedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  confirmedIconBox: {
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
  confirmedTitle: { fontSize: 24, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.5 },
  confirmedSub: { fontSize: 14, fontFamily: FontFamily.regular, color: J.inkSoft, textAlign: 'center', lineHeight: 22 },
  confirmedEmail: { fontFamily: FontFamily.bold, color: J.teal },
  confirmedHint: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, textAlign: 'center', lineHeight: 19 },
});
