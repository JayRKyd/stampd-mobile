import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Palette as J } from '@/constants/theme';
import { Special, useSpecialsToday, tagLabel, postedWhen, initials } from '@/lib/specials';

// A post, full screen: the flyer as large as it fits, the line as caption,
// and the two things you'd do next. Opened as a modal; X closes it.

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function SpecialScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { specials, refresh } = useSpecialsToday();

  const [fromServer, setFromServer] = useState<Special | null>(null);
  const [gone, setGone] = useState(false);
  const special = specials.find(sp => sp.id === id) ?? fromServer;

  // Membership (for the shop-name tap), phone (Call) and address (Directions)
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [mapsQuery, setMapsQuery] = useState<string | null>(null);

  // Cold start from a push: the cache may not have it yet
  useEffect(() => {
    if (special || !id) return;
    let alive = true;
    (async () => {
      await refresh();
      const { data } = await supabase.rpc('specials_today');
      if (!alive) return;
      const hit = Array.isArray(data) ? (data as Special[]).find(sp => sp.id === id) : null;
      if (hit) setFromServer(hit); else setGone(true);
    })();
    return () => { alive = false; };
  }, [id, special, refresh]);

  useEffect(() => {
    if (!special) return;
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const [{ data: ms }, { data: m }] = await Promise.all([
        user
          ? supabase.from('memberships').select('id').eq('user_id', user.id).eq('merchant_id', special.merchant_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('merchants').select('address, latitude, longitude, phone').eq('id', special.merchant_id).maybeSingle(),
      ]);
      if (!alive) return;
      setMembershipId((ms as any)?.id ?? null);
      const mm = m as any;
      setPhone(typeof mm?.phone === 'string' && mm.phone.trim() ? mm.phone : null);
      if (mm?.latitude != null && mm?.longitude != null) setMapsQuery(`${mm.latitude},${mm.longitude}`);
      else if (mm?.address) setMapsQuery(mm.address);
    })();
    return () => { alive = false; };
  }, [special]);

  async function openDirections() {
    if (!mapsQuery) return;
    const q = encodeURIComponent(mapsQuery);
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
    } catch {
      try { await Linking.openURL(`geo:0,0?q=${q}`); } catch { /* no maps app */ }
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const call = () => {
    if (phone) Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => {});
  };

  // Tapping the shop name: if this flyer was opened from the shop's own page,
  // just close back to it. Otherwise swap the flyer for the shop page so the
  // page's "Today at" block doesn't stack another copy of this flyer on top.
  const openCard = () => {
    if (!special) return;
    if (from === 'shop') return close();
    router.replace(membershipId ? `/card/${membershipId}` : `/discover/${special.merchant_id}`);
  };

  // The flyer area: as wide as the screen allows, 4:5, but never taller than what's left
  const maxH = SCREEN_H - insets.top - insets.bottom - 300;
  const imgW = Math.min(SCREEN_W - 40, Math.floor(maxH / 1.25));
  const imgH = Math.round(imgW * 1.25);

  return (
    <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.top}>
        <TouchableOpacity style={s.close} onPress={close} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
          <Ionicons name="close" size={18} color={J.ink} />
        </TouchableOpacity>
        {special && (
          <>
            <View style={s.logo}>
              {special.logo_url ? (
                <Image source={{ uri: special.logo_url }} style={s.logoImg} contentFit="contain" cachePolicy="memory-disk" />
              ) : (
                <Text style={[s.logoInitials, { color: special.card_color }]}>{initials(special.business_name)}</Text>
              )}
            </View>
            <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={openCard} activeOpacity={0.7} accessibilityLabel={`Open ${special.business_name}`}>
              <Text style={s.shop} numberOfLines={1}>{special.business_name}</Text>
              <Text style={s.when}>{postedWhen(special)} · {membershipId ? 'Open their card' : 'See the shop'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {!special ? (
        <View style={s.center}>
          {gone ? (
            <>
              <Text style={s.goneTitle}>This one's finished</Text>
              <Text style={s.goneBody}>The post has ended or was taken down.</Text>
              <TouchableOpacity style={s.btnLight} onPress={() => router.replace('/today')} activeOpacity={0.85}>
                <Text style={s.btnLightText}>See what's on today</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color={J.cream} />
          )}
        </View>
      ) : (
        <>
          <View style={s.center}>
            <View style={[s.flyer, { width: imgW, height: imgH, backgroundColor: special.card_color }]}>
              {special.image_url ? (
                <Image source={{ uri: special.image_url }} style={StyleSheet.absoluteFillObject} contentFit="contain" transition={200} cachePolicy="memory-disk" />
              ) : (
                <View style={s.textOnly}>
                  <Text style={s.textOnlyTag}>{tagLabel(special)}</Text>
                  <Text style={s.textOnlyLine}>{special.text}</Text>
                </View>
              )}
              <View style={s.tag}><Text style={s.tagText}>{tagLabel(special)}</Text></View>
            </View>
          </View>

          <View style={s.bottom}>
            <Text style={s.caption}>{special.text}{/[.!?]$/.test(special.text) ? '' : '.'} Stop by!{special.earns_stamp ? ' Earns a stamp.' : ''}</Text>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btnLight, !phone && { opacity: 0.4 }]} activeOpacity={0.85} onPress={call} disabled={!phone}>
                <Ionicons name="call" size={15} color={J.ink} />
                <Text style={s.btnLightText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnOutline, !mapsQuery && { opacity: 0.4 }]} activeOpacity={0.85} onPress={openDirections} disabled={!mapsQuery}>
                <Ionicons name="navigate-outline" size={15} color={J.cream} />
                <Text style={s.btnOutlineText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06251F' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 34, height: 34, borderRadius: 10, backgroundColor: J.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitials: { fontSize: 12, fontFamily: FontFamily.extrabold },
  shop: { fontSize: 15, fontFamily: FontFamily.extrabold, color: J.cream },
  when: { fontSize: 11, fontFamily: FontFamily.medium, color: 'rgba(247,242,232,0.7)', marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  flyer: { borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.45, shadowRadius: 30, elevation: 12 },
  textOnly: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 10 },
  textOnlyTag: { fontSize: 12, fontFamily: FontFamily.bold, color: Colors.gold, letterSpacing: 3 },
  textOnlyLine: { fontSize: 30, lineHeight: 36, fontFamily: FontFamily.extrabold, color: '#fff', textAlign: 'center', letterSpacing: -0.5 },
  tag: { position: 'absolute', top: 12, left: 12, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontSize: 10, fontFamily: FontFamily.extrabold, color: '#0C2E29', letterSpacing: 0.8 },
  bottom: { paddingHorizontal: 20, gap: 12 },
  caption: { fontSize: 19, lineHeight: 26, fontFamily: FontFamily.bold, color: J.cream, letterSpacing: -0.2 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnLight: { flex: 1, height: 48, borderRadius: 24, backgroundColor: J.cream, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  btnLightText: { fontSize: 14, fontFamily: FontFamily.extrabold, color: J.ink },
  btnOutline: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(247,242,232,0.3)', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText: { fontSize: 14, fontFamily: FontFamily.extrabold, color: J.cream },
  goneTitle: { fontSize: 18, fontFamily: FontFamily.extrabold, color: J.cream, marginBottom: 6 },
  goneBody: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(247,242,232,0.7)', marginBottom: 18 },
});
