import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Palette as J, FontFamily } from '@/constants/theme';

export default function AuthCallbackScreen() {
  return (
    <View style={s.root}>
      <ActivityIndicator size="large" color={J.teal} />
      <Text style={s.title}>Verifying your email</Text>
      <Text style={s.subtitle}>This will only take a moment.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: J.cream,
  },
  title: { fontSize: 20, fontFamily: FontFamily.bold, color: J.ink },
  subtitle: { fontSize: 14, fontFamily: FontFamily.regular, color: J.inkSoft },
});
