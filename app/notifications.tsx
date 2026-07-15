import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';
import { timeAgo } from '@/lib/timeAgo';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  sent_at: string;
  merchants: { business_name: string; logo_url: string | null } | null;
};

// Small type badge on the merchant avatar — the avatar carries identity,
// the badge carries what happened.
function badgeForType(type: string): { icon: React.ComponentProps<typeof Ionicons>['name']; bg: string } {
  if (type === 'stamp_received') return { icon: 'checkmark', bg: J.teal };
  if (type === 'reward_earned') return { icon: 'gift', bg: Colors.goldDark };
  if (type === 'reward_redeemed') return { icon: 'ribbon', bg: Colors.goldDark };
  if (type === 'lapsed_reminder') return { icon: 'heart', bg: J.inkSoft };
  return { icon: 'notifications', bg: J.teal };
}

function dateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) return 'This week';
  return 'Earlier';
}

function initialsOf(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rows, isLoading } = useCachedData('notifications', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, sent_at, merchants (business_name, logo_url)')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(50);

    return (((data as unknown) as NotificationRow[]) ?? []).map(r => ({
      ...r,
      merchants: Array.isArray(r.merchants) ? r.merchants[0] ?? null : r.merchants,
    }));
  });

  const items = rows ?? [];

  // Ordered date groups (rows arrive newest-first)
  const groups: { label: string; items: NotificationRow[] }[] = [];
  for (const row of items) {
    const label = dateGroup(row.sent_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={J.teal} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Notifications</Text>
        <View style={s.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && items.length === 0 ? (
          <ActivityIndicator color={J.teal} style={{ marginTop: 48 }} />
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="notifications-outline" size={28} color={J.teal} />
            </View>
            <Text style={s.emptyTitle}>No notifications yet</Text>
            <Text style={s.emptyBody}>
              You'll hear from us when a merchant stamps you or a reward unlocks.
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.label} style={s.group}>
              <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>
              <View style={s.groupCard}>
                {group.items.map((row, i) => {
                  const badge = badgeForType(row.type);
                  const merchant = row.merchants;
                  return (
                    <View
                      key={row.id}
                      style={[s.row, i !== group.items.length - 1 && s.rowBorder]}
                    >
                      {/* Merchant avatar + type badge */}
                      <View style={s.avatarWrap}>
                        <View style={s.avatar}>
                          {merchant?.logo_url ? (
                            <Image source={{ uri: merchant.logo_url }} style={s.avatarImg} contentFit="contain" transition={150} cachePolicy="memory-disk" />
                          ) : merchant?.business_name ? (
                            <Text style={s.avatarInitials}>{initialsOf(merchant.business_name)}</Text>
                          ) : (
                            <Ionicons name="sparkles" size={16} color={J.teal} />
                          )}
                        </View>
                        <View style={[s.badge, { backgroundColor: badge.bg }]}>
                          <Ionicons name={badge.icon} size={9} color="#fff" />
                        </View>
                      </View>

                      {/* Text */}
                      <View style={s.body}>
                        <View style={s.titleRow}>
                          <Text style={s.rowTitle} numberOfLines={1}>{row.title}</Text>
                          <Text style={s.rowTime}>{timeAgo(row.sent_at)}</Text>
                        </View>
                        <Text style={s.rowBody} numberOfLines={2}>{row.body}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: J.cream },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
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

  content: { paddingHorizontal: 20, paddingTop: 8 },

  group: { marginBottom: 20 },
  groupLabel: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: J.inkSoft,
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  groupCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadow.sm,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },

  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(0,96,90,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 14, fontFamily: FontFamily.extrabold, color: J.teal },
  badge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },
  rowTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: J.ink,
  },
  rowTime: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    color: J.inkSoft,
    opacity: 0.8,
    flexShrink: 0,
  },
  rowBody: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    lineHeight: 19,
  },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(0,96,90,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,96,90,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontFamily: FontFamily.extrabold, color: J.ink },
  emptyBody: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
});
