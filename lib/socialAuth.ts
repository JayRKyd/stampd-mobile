import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// ALL native auth modules are loaded lazily (require at call time), never as
// top-level imports. A static import of any of these runs when the welcome/
// login screen mounts, and if the native module is missing (Expo Go, or a
// build where a pod didn't link) it crashes the app on open. Loading them
// only when a sign-in button is tapped keeps the screens safe everywhere.
function loadGoogleSignin(): typeof import('@react-native-google-signin/google-signin') | null {
  try {
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}
function loadAppleAuth(): typeof import('expo-apple-authentication') | null {
  try {
    return require('expo-apple-authentication');
  } catch {
    return null;
  }
}
function loadCrypto(): typeof import('expo-crypto') | null {
  try {
    return require('expo-crypto');
  } catch {
    return null;
  }
}

const TERMS_VERSION = '1.0';
const PRIVACY_VERSION = '1.0';

export type SocialResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

// Android must use the Firebase-project (212158926484) web client — the same
// project google-services.json binds to. Hardcoded rather than read from an
// EXPO_PUBLIC_ env var to eliminate any build-time inlining risk (if that var
// ever failed to inline, Android silently fell back to the old-project client
// and every sign-in hit DEVELOPER_ERROR). This is a public client ID, not a
// secret — it already ships inside google-services.json.
const ANDROID_WEB_CLIENT_ID =
  '212158926484-o3nde3e97mhenr9djg1j5e9olovglu55.apps.googleusercontent.com';

let googleConfigured = false;
function configureGoogle(g: NonNullable<ReturnType<typeof loadGoogleSignin>>) {
  const webClientId =
    Platform.OS === 'android'
      ? ANDROID_WEB_CLIENT_ID
      : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (googleConfigured) return;
  g.GoogleSignin.configure({
    webClientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
}

/**
 * OAuth providers verify the email themselves, so social users skip the
 * confirmation-link dance entirely. After the Supabase session exists we
 * backfill what the email signup form would have collected: first/last name
 * (ensureProfile self-heals from this metadata) and the legal acceptance
 * stamp (the buttons carry a "By continuing you agree" caption).
 */
async function backfillMetadata(names?: { first?: string | null; last?: string | null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const meta = user.user_metadata ?? {};
  const patch: Record<string, string> = {};

  const first =
    (meta.first_name as string | undefined)?.trim() ||
    names?.first?.trim() ||
    (meta.given_name as string | undefined)?.trim() ||
    ((meta.full_name ?? meta.name) as string | undefined)?.trim().split(/\s+/)[0] ||
    '';
  const last =
    (meta.last_name as string | undefined)?.trim() ||
    names?.last?.trim() ||
    (meta.family_name as string | undefined)?.trim() ||
    ((meta.full_name ?? meta.name) as string | undefined)?.trim().split(/\s+/).slice(1).join(' ') ||
    '';

  if (!meta.first_name && first) patch.first_name = first;
  if (!meta.last_name && last) patch.last_name = last;

  if (!meta.terms_accepted_at) {
    const acceptedAt = new Date().toISOString();
    patch.terms_accepted_at = acceptedAt;
    patch.terms_version = TERMS_VERSION;
    patch.privacy_acknowledged_at = acceptedAt;
    patch.privacy_policy_version = PRIVACY_VERSION;
  }

  if (Object.keys(patch).length > 0) {
    await supabase.auth.updateUser({ data: patch }).catch(() => {});
  }
}

export async function signInWithApple(): Promise<SocialResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, cancelled: false, error: 'Apple sign-in is only available on iPhone.' };
  }
  const AppleAuthentication = loadAppleAuth();
  const Crypto = loadCrypto();
  if (!AppleAuthentication || !Crypto) {
    return { ok: false, cancelled: false, error: 'Apple sign-in needs the full app build.' };
  }
  try {
    // Nonce ties the Apple token to this attempt: Apple gets the hash,
    // Supabase gets the raw value and verifies they match.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, cancelled: false, error: 'Apple did not return a sign-in token. Try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { ok: false, cancelled: false, error: error.message };

    // Apple only shares the name on the FIRST authorization — save it now or lose it
    await backfillMetadata({
      first: credential.fullName?.givenName,
      last: credential.fullName?.familyName,
    });
    return { ok: true };
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, error: 'Apple sign-in failed. Try again.' };
  }
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const g = loadGoogleSignin();
  if (!g) {
    return {
      ok: false,
      cancelled: false,
      error: 'Google sign-in needs the full app build (not available in Expo Go).',
    };
  }
  try {
    configureGoogle(g);
    await g.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await g.GoogleSignin.signIn();

    if (response.type === 'cancelled') return { ok: false, cancelled: true };
    const idToken = response.data?.idToken;
    if (!idToken) {
      return { ok: false, cancelled: false, error: 'Google did not return a sign-in token. Try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { ok: false, cancelled: false, error: error.message };

    await backfillMetadata({
      first: response.data?.user?.givenName,
      last: response.data?.user?.familyName,
    });
    return { ok: true };
  } catch (e: unknown) {
    if (g.isErrorWithCode(e)) {
      if (e.code === g.statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
      if (e.code === g.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, cancelled: false, error: 'Google Play Services is not available on this device.' };
      }
      // Surface the real code (e.g. DEVELOPER_ERROR) so config problems are
      // diagnosable from the device instead of hidden behind a generic message.
      return { ok: false, cancelled: false, error: `Google sign-in failed (${String(e.code)}). Try again.` };
    }
    const msg = (e as { message?: string })?.message;
    return { ok: false, cancelled: false, error: `Google sign-in failed${msg ? `: ${msg}` : ''}. Try again.` };
  }
}
