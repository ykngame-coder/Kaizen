import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type AthleteProfileRow = Database['public']['Tables']['athlete_profiles']['Row'];
export type AthleteProfileInsert = Database['public']['Tables']['athlete_profiles']['Insert'];

/** Fetch the account profile, or null if none exists yet. */
export async function getProfile(
  client: SupotsuClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Guarantees a profiles row exists for this user. Normally provisioned by
 * the on_auth_user_created DB trigger right after signup, but that trigger
 * has been observed to silently not fire for a meaningful share of
 * signups (any provider) — leaving athlete_profiles/goals inserts (both FK
 * to profiles) failing at the final onboarding step with no clear error.
 * ignoreDuplicates means this never overwrites a real existing profile.
 */
export async function ensureProfile(
  client: SupotsuClient,
  userId: string,
  email: string,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .upsert({ id: userId, email }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Set (or clear, passing null) the account's avatar URL. */
export async function updateProfileAvatar(
  client: SupotsuClient,
  userId: string,
  avatarUrl: string | null,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Fetch the sport profile; its presence marks onboarding as complete. */
export async function getAthleteProfile(
  client: SupotsuClient,
  userId: string,
): Promise<AthleteProfileRow | null> {
  const { data, error } = await client
    .from('athlete_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Create or update the sport profile (onboarding completion). */
export async function upsertAthleteProfile(
  client: SupotsuClient,
  input: AthleteProfileInsert,
): Promise<AthleteProfileRow> {
  const { data, error } = await client
    .from('athlete_profiles')
    .upsert(input, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
