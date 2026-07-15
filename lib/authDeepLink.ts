import { supabase } from './supabase';

export const AUTH_CALLBACK_URL = 'stampd://auth/callback';

export function isAuthCallbackUrl(url: string): boolean {
  return url.startsWith(AUTH_CALLBACK_URL);
}

/** Convert the tokens returned by a Supabase confirmation link into a session. */
export async function createSessionFromAuthUrl(url: string): Promise<void> {
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  const params = new URLSearchParams([query, fragment].filter(Boolean).join('&'));

  const authError = params.get('error_description') ?? params.get('error');
  if (authError) throw new Error(authError);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new Error('The verification link did not contain a session.');
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}
