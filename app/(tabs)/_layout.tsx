import { Tabs } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Palette } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index:    { active: 'home',    inactive: 'home-outline' },
  discover: { active: 'compass', inactive: 'compass-outline' },
  rewards:  { active: 'gift',    inactive: 'gift-outline' },
  profile:  { active: 'person',  inactive: 'person-outline' },
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';

  // Dynamic calculations to clear software/hardware buttons and gestures
  const tabBarHeight = isIOS
    ? (insets.bottom > 0 ? 66 + insets.bottom : 88)
    : (insets.bottom > 0 ? 70 + insets.bottom : 86);

  const tabBarPaddingBottom = isIOS
    ? (insets.bottom > 0 ? insets.bottom + 4 : 24)
    : (insets.bottom > 0 ? insets.bottom + 10 : 22);

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      // Tab scenes also sit on a white layer by default — first visits to a
      // lazily-mounted tab flashed white before the screen painted
      sceneStyle: { backgroundColor: Palette.cream },
      tabBarStyle: [
        s.tabBar,
        {
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
        }
      ],
      tabBarLabelStyle: s.label,
      tabBarActiveTintColor: Palette.teal,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarIcon: ({ focused, color, size }) => {
        const icons = ICONS[route.name];
        return (
          <Ionicons
            name={focused ? icons.active : icons.inactive}
            size={22}
            color={color}
          />
        );
      },
    })}>
      <Tabs.Screen name="index"    options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="rewards"  options={{ title: 'Rewards' }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    marginTop: 2,
  },
});
