// The public web app handles auth email landings (password reset, email
// confirmation) for mobile users — phones have no page to receive the links.
export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.stampdbahamas.com';
