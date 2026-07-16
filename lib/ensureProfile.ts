import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { hasCompleteName } from '@/lib/displayName';

const cacheKey = (userId: string) => `profileComplete:${userId}`;

async function checkNames(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();

  if (hasCompleteName(data)) return true;

  // Self-heal from auth metadata if trigger missed it
  const { data: { user } } = await supabase.auth.getUser();
  const meta = user?.user_metadata;
  const first = (meta?.first_name as string | undefined)?.trim();
  const last = (meta?.last_name as string | undefined)?.trim();

  if (first && last) {
    await supabase.from('users').update({ first_name: first, last_name: last }).eq('id', userId);
    return true;
  }

  return false;
}

/**
 * Returns true when the user row has both first and last name set.
 *
 * The root layout blocks boot on this answer, so it must NEVER hang or
 * throw: offline or on a slow network it falls back to the last answer
 * this device saw (optimistically true for a signed-in user). The check
 * re-runs on navigation, so a genuinely incomplete profile still gets
 * routed to complete-profile once the network is back.
 */
export async function profileNamesComplete(userId: string): Promise<boolean> {
  try {
    const result = await Promise.race([
      checkNames(userId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('profile check timed out')), 5000)
      ),
    ]);
    AsyncStorage.setItem(cacheKey(userId), result ? '1' : '0').catch(() => {});
    return result;
  } catch {
    const cached = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
    return cached !== '0';
  }
}
