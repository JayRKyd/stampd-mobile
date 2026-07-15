import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { cardGradient } from '@/lib/cardColor';
import { Colors, FontFamily, Palette as J, Shadow } from '@/constants/theme';

type StampEvent = {
  id: string;
  created_at: string;
  method: string;
  stamp_number: number;
  membership_id: string;
  business_name: string;
  card_color: string;
};

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<StampEvent[]>([]);
  const [totalStamps, setTotalStamps] = useState(0);
  const [activeCards, setActiveCards] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: memberships }, { data: stampEvents }, { data: rewards }] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, current_stamps, total_rewards_earned, merchants(business_name), loyalty_cards(card_color)')
          .eq('user_id', user.id),
        supabase
          .from('stamp_events')
          .select('id, created_at, method, stamp_number, membership_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('rewards')
          .select('id')
          .eq('user_id', user.id),
      ]);

      const ms = (memberships as any) ?? [];
      setTotalStamps(ms.reduce((sum: number, m: any) => sum + (m.current_stamps ?? 0), 0));
      setActiveCards(ms.length);
      setTotalRewards((rewards ?? []).length);

      // membership_id → business name + true brand color (same fallback as everywhere else)
      const memberMap: Record<string, { name: string; color: string }> = {};
      ms.forEach((m: any, i: number) => {
        memberMap[m.id] = {
          name: m.merchants?.business_name ?? 'Unknown',
          color: cardGradient(m.loyalty_cards?.card_color, i)[0],
        };
      });

      const evts: StampEvent[] = ((stampEvents as any) ?? [])
        .filter((e: any) => memberMap[e.membership_id])
        .map((e: any) => ({
          ...e,
          business_name: memberMap[e.membership_id].name,
          card_color: memberMap[e.membership_id].color,
        }));

      setEvents(evts);
      setLoading(false);
    }
    load();
  }, []);

  function methodLabel(method: string) {
    if (method === 'phone_number') return 'Via phone number';
    if (method === 'personal_pin') return 'Via your PIN';
    if (method === 'generated_pin') return 'Via merchant PIN';
    return 'Via your PIN';
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
        <Text style={s.topBarTitle}>Stamp History</Text>
        <View style={s.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <View style={s.summaryCard}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{totalStamps}</Text>
            <Text style={s.summaryLabel}>CURRENT STAMPS</Text>
          </View>
          <View style={s.summarySep} />
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{activeCards}</Text>
            <Text style={s.summaryLabel}>CARDS ACTIVE</Text>
          </View>
          <View style={s.summarySep} />
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{totalRewards}</Text>
            <Text style={s.summaryLabel}>REWARDS</Text>
          </View>
        </View>

        {/* Timeline */}
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={J.teal} />
          </View>
        ) : events.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="time-outline" size={28} color={J.teal} />
            </View>
            <Text style={s.emptyTitle}>No activity yet</Text>
            <Text style={s.emptyText}>
              Show your PIN when you pay at a local spot — every stamp lands here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>RECENT ACTIVITY</Text>

            {events.map((ev, i) => {
              const date = new Date(ev.created_at);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              const isLast = i === events.length - 1;

              return (
                <View key={ev.id} style={s.timelineItem}>
                  <View style={s.timeline}>
                    <View style={[s.timelineDot, { backgroundColor: ev.card_color }]} />
                    {!isLast && <View style={s.timelineLine} />}
                  </View>
                  <View style={s.historyCard}>
                    <View style={s.historyTop}>
                      <Text style={s.historyBusiness} numberOfLines={1}>{ev.business_name}</Text>
                      <Text style={s.historyDate}>{dateStr}, {timeStr}</Text>
                    </View>
                    <Text style={s.historyDetail}>
                      Stamp #{ev.stamp_number} · {methodLabel(ev.method)}
                    </Text>
                  </View>
                </View>
              );
            })}

            <View style={s.endMessage}>
              <Text style={s.endText}>You're all caught up</Text>
            </View>
          </>
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

  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 24,
    ...Shadow.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: {
    fontSize: 24,
    fontFamily: FontFamily.extrabold,
    color: J.ink,
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: FontFamily.medium,
    color: J.inkSoft,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  summarySep: { width: 1, backgroundColor: Colors.borderLight, alignSelf: 'stretch', marginVertical: 4 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: J.inkSoft,
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  timelineItem: { flexDirection: 'row' },
  timeline: { width: 24, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 4 },
  historyCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginLeft: 12,
    marginBottom: 10,
    ...Shadow.sm,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
    gap: 8,
  },
  historyBusiness: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: J.ink,
  },
  historyDate: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    flexShrink: 0,
  },
  historyDetail: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
  },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
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
  emptyText: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: J.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  endMessage: { alignItems: 'center', paddingVertical: 24 },
  endText: { fontSize: 13, fontFamily: FontFamily.regular, color: J.inkSoft },
});
