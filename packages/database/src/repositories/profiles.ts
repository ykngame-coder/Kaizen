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
