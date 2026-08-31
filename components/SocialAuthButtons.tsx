import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithApple, signInWithGoogle } from '@/lib/socialAuth';
import { FontFamily, Palette as J } from '@/constants/theme';

interface Props {
  /** 'dark' sits on the welcome photo; 'light' sits on the cream login card */
  tone: 'dark' | 'light';
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function SocialAuthButtons({ tone, onSuccess, onError }: Props) {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const dark = tone === 'dark';

  const run = async (provider: 'apple' | 'google') => {
    if (busy) return;
    setBusy(provider);
    const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setBusy(null);
    if (result.ok) onSuccess();
    else if (!result.cancelled) onError(result.error);
  };

  return (
    <View style={s.wrap}>
      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={[s.btn, dark ? s.appleDark : s.appleLight]}
          onPress={() => run('apple')}
          activeOpacity={0.9}
          disabled={busy !== null}
        >
          {busy === 'apple' ? (
            <ActivityIndicator color={dark ? J.ink : '#fff'} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color={dark ? J.ink : '#fff'} />
              <Text style={[s.btnText, { color: dark ? J.ink : '#fff' }]}>Continue with Apple</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[s.btn, dark ? s.googleDark : s.googleLight]}
        onPress={() => run('google')}
        activeOpacity={0.9}
        disabled={busy !== null}
      >
        {busy === 'google' ? (
          <ActivityIndicator color={J.ink} />
        ) : (
          <>
            {/* Official Google G (branding kit), transparent background */}
            <Image source={require('@/assets/google-g.png')} style={s.googleIcon} />
            <Text style={[s.btnText, { color: J.ink }]}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  btn: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnText: { fontSize: 15, fontFamily: FontFamily.bold },
  googleIcon: { width: 20, height: 20 },

  appleDark: { backgroundColor: '#fff' },
  appleLight: { backgroundColor: '#000' },
  googleDark: { backgroundColor: '#fff' },
  googleLight: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
});
