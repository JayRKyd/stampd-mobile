import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name');
      return;
    }

    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired — please sign in again');
      setLoading(false);
      return;
    }

    const first = firstName.trim();
    const last = lastName.trim();

    const [{ error: updateError }, { error: authError }] = await Promise.all([
      supabase.from('users').update({ first_name: first, last_name: last }).eq('id', user.id),
      supabase.auth.updateUser({ data: { first_name: first, last_name: last } }),
    ]);

    setLoading(false);

    if (updateError || authError) {
      setError('Could not save your name — try again');
      return;
    }

    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>What's your name?</Text>
        <Text style={s.sub}>
          Merchants see this when you show your PIN at the counter — first and last name required.
        </Text>

        <View style={s.inputGroup}>
          <TextInput
            style={s.inputRow}
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setError(''); }}
            placeholder="First name"
            placeholderTextColor={Colors.textMuted}
            autoComplete="given-name"
            autoCapitalize="words"
            autoFocus
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

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>{loading ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

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
  inputRow: {
    height: 54,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: J.ink,
  },
  inputDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 16 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingHorizontal: 4 },
  errorText: { flex: 1, fontSize: 12, fontFamily: FontFamily.medium, color: Colors.danger },

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
