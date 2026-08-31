import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

// Loaded lazily: the Google Sign-In native module doesn't exist in Expo Go,
// and a top-level import would crash the auth screens there. In a dev/EAS
// build the require succeeds; in Expo Go the button shows a clear message.
function loadGoogleSignin(): typeof import('@react-native-google-signin/google-signin') | null {
  try {
    return require('@react-native-google-signin/google-signin');
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

let googleConfigured = false;
function configureGoogle(g: NonNullable<ReturnType<typeof loadGoogleSignin>>) {
  if (googleConfigured) return;
  g.GoogleSignin.configure({
    // The WEB client ID (not the platform ones) — Supabase validates the
    // idToken audience against this. Platform client IDs are picked up from
    // the native build config.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
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
    }
    return { ok: false, cancelled: false, error: 'Google sign-in failed. Try again.' };
  }
}
