export const Colors = {
  primary: '#2d6b7a',
  primaryDark: '#235c6a',
  primaryLight: '#4a8d9c',
  primaryMuted: 'rgba(45,107,122,0.1)',
  primaryBorder: 'rgba(45,107,122,0.2)',
  gold: '#d4a843',
  goldDark: '#b8922e',
  goldLight: '#f0d78a',
  goldMuted: 'rgba(212,168,67,0.15)',

  background: '#f8fafb',
  surface: '#ffffff',
  surfaceSecondary: '#f2f6f7',
  surfaceTertiary: '#eaf0f1',
  sheet: '#edf1f2',

  text: '#162428',
  textSecondary: '#5c7178',
  textMuted: '#94aab1',
  textTertiary: '#94aab1',
  textInverse: '#ffffff',

  border: '#e6edef',
  borderLight: '#f1f5f6',

  success: '#2fa85a',
  successMuted: 'rgba(47,168,90,0.1)',
  danger: '#e04454',
  dangerMuted: 'rgba(224,68,84,0.1)',
  error: '#e04454',

  tabActive: '#2d6b7a',
  tabInactive: '#a3b8be',

  cardGradients: [
    ['#2d6b7a', '#235c6a'],
    ['#5c4ecc', '#3d32a8'],
    ['#2d9b5a', '#1a6b3c'],
    ['#c85a1e', '#8f3a0e'],
    ['#7b5ea7', '#543b7a'],
  ] as [string, string][],
};

// App-wide palette for the Joyn-style redesign (home, discover, …).
// Sampled from the reference design; teal header + cream sheet.
export const Palette = {
  teal: '#00605A',        // header background
  tealDeep: '#024D48',    // hero carousel card
  bannerGreen: '#0C4A40', // promo banner
  cream: '#F7F2E8',       // sheet background
  creamBar: '#F3EBD9',    // progress bar fill
  giftRed: '#E2504C',     // rewards stat icon
  amber: '#F5A623',       // stamps stat dot
  ink: '#1A2B2A',         // dark text on cream
  inkSoft: '#74807E',     // secondary text on cream
};

export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 40 };
export const Radius = { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28, full: 9999 };
export const Shadow = {
  sm: { shadowColor: '#0f1c20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  md: { shadowColor: '#0f1c20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  card: { shadowColor: '#2d6b7a', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
};
