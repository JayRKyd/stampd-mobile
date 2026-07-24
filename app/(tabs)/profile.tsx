import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, AppState, Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/pushNotifications';
import { useCachedData } from '@/lib/dataCache';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';
import { PinCard } from '@/components/PinCard';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editVisible, setEditVisible] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);

  // iOS shows the permission prompt exactly once — after that, users who
  // denied (or toggled off) can only re-enable in Settings. Surface that
  // state here with a direct link, and register the token the moment they
  // come back with it granted.
  const checkPushPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPushGranted(status === 'granted');
      if (status === 'granted') registerPushToken().catch(() => {});
    } catch {
      // leave state unknown — never block the profile screen on this
    }
  }, []);

  useFocusEffect(useCallback(() => { checkPushPermission(); }, [checkPushPermission]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPushPermission();
    });
    return () => sub.remove();
  }, [checkPushPermission]);

  const { data: profData, refresh } = useCachedData('profile', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    return { profile: data, email: user.email ?? '' };
  });
  const profile = profData?.profile ?? null;
  const email = profData?.email ?? '';

  function openNameEdit() {
    setEditFirst(profile?.first_name ?? '');
    setEditLast(profile?.last_name ?? '');
    setEditError('');
    setEditVisible(true);
  }

  async function saveNameEdit() {
    if (!editFirst.trim() || !editLast.trim()) {
      setEditError('Both first and last name are required');
      return;
    }

    setEditLoading(true);
    setEditError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEditError('Session expired');
      setEditLoading(false);
      return;
    }

    const first = editFirst.trim();
    const last = editLast.trim();

    const [{ error: updateError }, { error: authError }] = await Promise.all([
      supabase.from('users').update({ first_name: first, last_name: last }).eq('id', user.id),
      supabase.auth.updateUser({ data: { first_name: first, last_name: last } }),
    ]);

    setEditLoading(false);

    if (updateError || authError) {
      setEditError('Could not save — try again');
      return;
    }

    refresh();
    setEditVisible(false);
  }

  // No manual navigation here — the root layout's auth guard redirects to
  // welcome when the session ends. Navigating here too caused a double
  // welcome-screen transition.
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    setDeleteError('');
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      setDeleteError('Could not delete your account — try again or contact support.');
      setDeleteLoading(false);
      return;
    }
    await supabase.auth.signOut();
  }

  const formattedPin = profile?.personal_pin
    ? `${profile.personal_pin.slice(0, 3)} ${profile.personal_pin.slice(3)}`
    : '--- ---';

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const firstDisplay = profile?.first_name?.trim() || 'Not set';
  const lastDisplay = profile?.last_name?.trim() || 'Not set';
  const initial = profile?.first_name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={s.root}>
      {/* Teal header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerEyebrow}>Your account</Text>
            <Text style={s.headerTitle}>Profile</Text>
          </View>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
        </View>
      </View>

      {/* Cream sheet */}
      <View style={s.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
        >
          {/* PIN hero — the card */}
          <PinCard
            pinDisplay={formattedPin}
            holderName={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Stampd Member'}
            memberSince={profile?.created_at
              ? `${String(new Date(profile.created_at).getMonth() + 1).padStart(2, '0')}/${String(new Date(profile.created_at).getFullYear()).slice(2)}`
              : '—'}
          />
          <Text style={s.pinCaption}>
            Show this when you pay — your first stamp joins you to a merchant's program.
          </Text>

          {/* Notifications */}
          <TouchableOpacity
            style={s.notifRow}
            onPress={() => router.navigate('/notifications')}
            activeOpacity={0.8}
          >
            <View style={s.notifIcon}>
              <Ionicons name="notifications-outline" size={18} color={J.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.notifLabel}>Notifications</Text>
              <Text style={s.notifSub}>Stamps, rewards, and updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={J.inkSoft} />
          </TouchableOpacity>

          {/* Push permission is off — one tap to the iOS settings page */}
          {pushGranted === false && (
            <TouchableOpacity
              style={s.pushOffCard}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.85}
            >
              <Ionicons name="notifications-off-outline" size={17} color={J.amber} />
              <Text style={s.pushOffText}>
                Push notifications are off — you'll miss reward alerts.
              </Text>
              <View style={s.pushOffBtn}>
                <Text style={s.pushOffBtnText}>Turn on</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Account */}
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.accountCard}>
            <View style={s.row}>
              <Text style={s.rowLabel}>Email</Text>
              <Text style={s.rowValue} numberOfLines={1}>{email || '—'}</Text>
            </View>
            <View style={s.divider} />
            <TouchableOpacity style={s.row} onPress={openNameEdit} activeOpacity={0.7}>
              <Text style={s.rowLabel}>First name</Text>
              <View style={s.rowRight}>
                <Text style={[s.rowValue, !profile?.first_name && s.rowValueMuted]}>{firstDisplay}</Text>
                <Ionicons name="chevron-forward" size={14} color={J.inkSoft} />
              </View>
            </TouchableOpacity>
            <View style={s.divider} />
            <TouchableOpacity style={s.row} onPress={openNameEdit} activeOpacity={0.7}>
              <Text style={s.rowLabel}>Last name</Text>
              <View style={s.rowRight}>
                <Text style={[s.rowValue, !profile?.last_name && s.rowValueMuted]}>{lastDisplay}</Text>
                <Ionicons name="chevron-forward" size={14} color={J.inkSoft} />
              </View>
            </TouchableOpacity>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.rowLabel}>Member since</Text>
              <Text style={s.rowValue}>{memberSince}</Text>
            </View>
          </View>

          {/* Sign Out — no confirmation, by design */}
          <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={17} color={Colors.danger} />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Account deletion — confirmation required, it's irreversible */}
          <TouchableOpacity
            style={s.deleteLink}
            onPress={() => { setDeleteError(''); setDeleteVisible(true); }}
            activeOpacity={0.7}
          >
            <Text style={s.deleteLinkText}>Delete account</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Edit name sheet */}
      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setEditVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Edit name</Text>
            <Text style={s.sheetSub}>Merchants see your full name when you show your PIN.</Text>

            <View style={s.inputGroup}>
              <TextInput
                style={s.inputRow}
                value={editFirst}
                onChangeText={(t) => { setEditFirst(t); setEditError(''); }}
                placeholder="First name"
                placeholderTextColor={Colors.textMuted}
                autoComplete="given-name"
                autoCapitalize="words"
              />
              <View style={s.inputDivider} />
              <TextInput
                style={s.inputRow}
                value={editLast}
                onChangeText={(t) => { setEditLast(t); setEditError(''); }}
                placeholder="Last name"
                placeholderTextColor={Colors.textMuted}
                autoComplete="family-name"
                autoCapitalize="words"
              />
            </View>

            {editError ? (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                <Text style={s.errorText}>{editError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.primaryBtn, editLoading && s.primaryBtnDisabled]}
              onPress={saveNameEdit}
              disabled={editLoading}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>{editLoading ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete account confirmation */}
      <Modal visible={deleteVisible} animationType="slide" transparent onRequestClose={() => setDeleteVisible(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => !deleteLoading && setDeleteVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <View style={s.deleteIconBox}>
              <Ionicons name="trash-outline" size={26} color={Colors.danger} />
            </View>
            <Text style={[s.sheetTitle, { textAlign: 'center' }]}>Delete your account?</Text>
            <Text style={[s.sheetSub, { textAlign: 'center' }]}>
              This is permanent. Your PIN, stamp cards, progress, and any unclaimed rewards will be gone for good.
            </Text>

            {deleteError ? (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                <Text style={s.errorText}>{deleteError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.deleteBtn, deleteLoading && s.primaryBtnDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
              activeOpacity={0.85}
            >
              <Text style={s.deleteBtnText}>{deleteLoading ? 'Deleting…' : 'Delete my account'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setDeleteVisible(false)}
              disabled={deleteLoading}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.teal },

  // Header
  header: { backgroundColor: J.teal, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerEyebrow: { fontSize: 12, fontFamily: FontFamily.medium, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: FontFamily.extrabold, color: '#fff', letterSpacing: -0.6, lineHeight: 34 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  avatarText: { fontSize: 17, fontFamily: FontFamily.extrabold, color: '#fff' },

  // Sheet
  sheet: {
    flex: 1, backgroundColor: J.cream,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: { paddingHorizontal: 20, paddingTop: 20 },

  // PIN hero
  pinCaption: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  // Notifications row
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
    ...Shadow.sm,
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,96,90,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifLabel: { fontSize: 15, fontFamily: FontFamily.semibold, color: J.ink },
  notifSub: { fontSize: 12, fontFamily: FontFamily.regular, color: J.inkSoft, marginTop: 2 },

  pushOffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,166,35,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.35)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: -14,
    marginBottom: 24,
  },
  pushOffText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: J.ink,
    lineHeight: 17,
  },
  pushOffBtn: {
    backgroundColor: J.amber,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pushOffBtnText: { fontSize: 12, fontFamily: FontFamily.bold, color: '#fff' },

  // Account
  sectionLabel: {
    fontSize: 11, fontFamily: FontFamily.semibold, color: J.inkSoft,
    letterSpacing: 0.8, marginBottom: 10,
  },
  accountCard: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 16, marginBottom: 20, ...Shadow.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, maxWidth: '55%' },
  rowLabel: { fontSize: 15, fontFamily: FontFamily.medium, color: J.ink },
  rowValue: { fontSize: 14, fontFamily: FontFamily.medium, color: J.inkSoft },
  rowValueMuted: { color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.borderLight },

  // Sign out
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 15,
    ...Shadow.sm,
  },
  signOutText: { fontSize: 15, fontFamily: FontFamily.semibold, color: Colors.danger },

  deleteLink: { alignItems: 'center', paddingVertical: 18 },
  deleteLinkText: { fontSize: 13, fontFamily: FontFamily.medium, color: J.inkSoft, textDecorationLine: 'underline' },

  deleteIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  deleteBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 16, fontFamily: FontFamily.bold, color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 16 },
  cancelBtnText: { fontSize: 14, fontFamily: FontFamily.semibold, color: J.inkSoft },

  // Edit sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,27,42,0.6)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontFamily: FontFamily.extrabold, color: J.ink, letterSpacing: -0.3, marginBottom: 4 },
  sheetSub: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft, marginBottom: 18 },

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
