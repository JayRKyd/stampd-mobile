import { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { revalidateCache, revalidateCachePrefix } from '@/lib/dataCache';
import { FontFamily, Palette as J, Shadow } from '@/constants/theme';

type LiveNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
};

// The surfaces that show stamp/reward state — refreshed in place the instant
// a notification lands, so the card animates without a manual pull-to-refresh.
const LIVE_KEYS = ['home', 'my-cards', 'notifications', 'rewards', 'profile'];
// Dynamic per-id screens (open card / merchant detail) refreshed by prefix.
const LIVE_KEY_PREFIXES = ['card-detail:', 'merchant:'];

function visualsFor(type: string): { icon: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  if (type === 'reward_earned') return { icon: 'gift', color: J.amber };
  if (type === 'reward_redeemed') return { icon: 'ribbon', color: J.amber };
  if (type === 'lapsed_reminder') return { icon: 'heart', color: J.giftRed };
  return { icon: 'checkmark-circle', color: J.teal };
}

/**
 * Mounted once in the root layout while signed in. Subscribes to realtime
 * INSERTs on the user's notifications and surfaces each as a branded toast
 * that drops from the top — the "live stamp" moment at the counter. Also
 * refreshes cached screens so cards update the instant a stamp lands.
 */
export function LiveNotifications({ userId }: { userId: string | undefined }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [toast, setToast] = useState<LiveNotification | null>(null);

  const translateY = useSharedValue(-160);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToast = useCallback(() => setToast(null), []);

  const dismiss = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    translateY.value = withTiming(-160, { duration: 220 }, (done) => {
      if (done) runOnJS(clearToast)();
    });
  }, [translateY, clearToast]);

  const show = useCallback((n: LiveNotification) => {
    setToast(n);
    // Reset any in-flight hide, then spring in and hold for 4s
    if (hideTimer.current) clearTimeout(hideTimer.current);
    translateY.value = withSpring(0, { damping: 16, stiffness: 180, mass: 0.9 });
    hideTimer.current = setTimeout(() => {
      translateY.value = withDelay(0, withTiming(-160, { duration: 220 }, (done) => {
        if (done) runOnJS(clearToast)();
      }));
    }, 4000);
  }, [translateY, clearToast]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as LiveNotification;
          // Refresh visible screens so the card reflects the new stamp/reward,
          // including an open card-detail or merchant-detail screen
          revalidateCache(...LIVE_KEYS);
          revalidateCachePrefix(...LIVE_KEY_PREFIXES);
          // Haptic: notificationAsync is the most reliable generator on iOS — a
          // one-shot impactAsync can be dropped when the Taptic engine is idle
          // between events, which is why the Medium tap wasn't felt. Every
          // notification gets the firm success pattern; a won reward gets an
          // extra Heavy kick just after so it feels bigger than a routine stamp.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (n.type === 'reward_earned') {
            setTimeout(() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            }, 140);
          }
          show(n);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [userId, show]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!toast) return null;

  const v = visualsFor(toast.type);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.wrap, { top: insets.top + 8 }, animStyle]}
    >
      <Pressable
        style={s.card}
        onPress={() => { dismiss(); router.push('/notifications'); }}
        accessibilityRole="button"
        accessibilityLabel={`${toast.title}. ${toast.body}`}
      >
        <View style={[s.iconWrap, { backgroundColor: v.color }]}>
          <Ionicons name={v.icon} size={20} color="#fff" />
        </View>
        <View style={s.textWrap}>
          <Text style={s.title} numberOfLines={1}>{toast.title}</Text>
          <Text style={s.body} numberOfLines={2}>{toast.body}</Text>
        </View>
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={s.close}
        >
          <Ionicons name="close" size={16} color={J.inkSoft} />
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...Shadow.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontFamily: FontFamily.bold, color: J.ink },
  body: { fontSize: 12.5, fontFamily: FontFamily.regular, color: J.inkSoft, marginTop: 1, lineHeight: 17 },
  close: { padding: 2 },
});
