import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { nameProfanityError } from '@/lib/profanity';
import { ISLANDS, IslandId, DEFAULT_ISLAND, syncIslandFromServer } from '@/lib/island';
import { FontCap, Colors, FontFamily, Palette as J } from '@/constants/theme';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Picked once here; the badge on Home changes it later
  const [island, setIsland] = useState<IslandId>(DEFAULT_ISLAND);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name');
      return;
    }

    const profanityError = nameProfanityError(firstName, lastName);
    if (profanityError) {
      setError(profanityError);
      return;
    }

    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired. Please sign in again');
      setLoading(false);
      return;
    }

    const first = firstName.trim();
    const last = lastName.trim();

    const [{ error: updateError }, { error: authError }] = await Promise.all([
      supabase.from('users').update({ first_name: first, last_name: last, island }).eq('id', user.id),
      supabase.auth.updateUser({ data: { first_name: first, last_name: last } }),
    ]);

    setLoading(false);

    if (updateError || authError) {
      setError('Could not save your name. Try again');
      return;
    }

    syncIslandFromServer(island);
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text {...FontCap} style={s.title}>What's your name?</Text>
        <Text {...FontCap} style={s.sub}>
          Merchants see this when you show your PIN at the counter. First and last name required.
        </Text>

        <View style={s.inputGroup}>
          <TextInput {...FontCap}
            style={s.inputRow}
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setError(''); }}
            placeholder="First name"
            placeholderTextColor={J.inkMuted}
            autoComplete="given-name"
            autoCapitalize="words"
            autoFocus
          />
          <View style={s.inputDivider} />
          <TextInput {...FontCap}
            style={s.inputRow}
            value={lastName}
            onChangeText={(t) => { setLastName(t); setError(''); }}
            placeholder="Last name"
            placeholderTextColor={J.inkMuted}
            autoComplete="family-name"
            autoCapitalize="words"
          />
        </View>

        <Text {...FontCap} style={s.islandLabel}>Which island are you on?</Text>
        <View style={s.islandRow}>
          {ISLANDS.map(i => {
            const on = i.id === island;
            return (
              <TouchableOpacity
                key={i.id}
                style={[s.islandPill, on && s.islandPillOn]}
                onPress={() => setIsland(i.id)}
                activeOpacity={0.85}
                accessibilityState={{ selected: on }}
              >
                <Ionicons name="location" size={14} color={on ? '#fff' : J.teal} />
                <Text {...FontCap} style={[s.islandPillText, on && s.islandPillTextOn]}>{i.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text {...FontCap} style={s.islandHint}>You'll see the shops near you. You can change this any time from Home.</Text>

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text {...FontCap} style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text {...FontCap} style={s.primaryBtnText}>{loading ? 'Saving…' : 'Continue'}</Text>
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

  islandLabel: { fontSize: 13, fontFamily: FontFamily.bold, color: J.ink, marginTop: 6, marginBottom: 10 },
  islandRow: { flexDirection: 'row', gap: 10 },
  islandPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  islandPillOn: { backgroundColor: J.teal, borderColor: J.teal },
  islandPillText: { fontSize: 14, fontFamily: FontFamily.semibold, color: J.ink },
  islandPillTextOn: { color: '#fff', fontFamily: FontFamily.bold },
  islandHint: { fontSize: 12, fontFamily: FontFamily.regular, color: J.inkSoft, lineHeight: 17, marginTop: 10, marginBottom: 18 },

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
