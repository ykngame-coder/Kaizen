import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type ChallengeRow = Database['public']['Tables']['challenges']['Row'];
export type ChallengeInsertRow = Database['public']['Tables']['challenges']['Insert'];
export type ChallengeParticipantRow = Database['public']['Tables']['challenge_participants']['Row'];

/** Create a challenge. */
export async function insertChallenge(
  client: SupotsuClient,
  row: ChallengeInsertRow,
): Promise<ChallengeRow> {
  const { data, error } = await client.from('challenges').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/** List challenges visible to the user (public + own), soonest to end first. */
export async function listChallenges(client: SupotsuClient): Promise<ChallengeRow[]> {
  const { data, error } = await client
    .from('challenges')
    .select('*')
    .order('ends_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The user's joined challenge ids. */
export async function listMyParticipations(
  client: SupotsuClient,
  userId: string,
): Promise<ChallengeParticipantRow[]> {
  const { data, error } = await client
    .from('challenge_participants')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

/** Join a challenge (idempotent via the unique (user, challenge) constraint). */
export async function joinChallenge(
  client: SupotsuClient,
  userId: string,
  challengeId: string,
): Promise<void> {
  const { error } = await client
    .from('challenge_participants')
    .upsert(
      { user_id: userId, challenge_id: challengeId },
      { onConflict: 'user_id,challenge_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Aggregated leaderboard (progress only) via the SECURITY DEFINER function. */
export async function fetchLeaderboard(
  client: SupotsuClient,
  challengeId: string,
): Promise<{ user_id: string; progress: number }[]> {
  const { data, error } = await client.rpc('challenge_leaderboard', { p_challenge: challengeId });
  if (error) throw error;
  return data ?? [];
}
