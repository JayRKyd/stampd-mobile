import { supabase } from '@/lib/supabase';
import { hasCompleteName } from '@/lib/displayName';

/** Returns true when the user row has both first and last name set. */
export async function profileNamesComplete(userId: string): Promise<boolean> {
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
