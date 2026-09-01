import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type HabitRow = Database['public']['Tables']['habits']['Row'];
export type HabitInsertRow = Database['public']['Tables']['habits']['Insert'];
export type HabitLogRow = Database['public']['Tables']['habit_logs']['Row'];
export type EarnedBadgeRow = Database['public']['Tables']['earned_badges']['Row'];
export type EarnedBadgeInsertRow = Database['public']['Tables']['earned_badges']['Insert'];

/** Create a habit. */
export async function insertHabit(client: SupotsuClient, row: HabitInsertRow): Promise<HabitRow> {
  const { data, error } = await client.from('habits').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/** List the user's active (non-archived) habits. */
export async function listHabits(client: SupotsuClient, userId: string): Promise<HabitRow[]> {
  const { data, error } = await client
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Record one habit completion. */
export async function insertHabitLog(
  client: SupotsuClient,
  userId: string,
  habitId: string,
  completedAt: string,
): Promise<HabitLogRow> {
  const { data, error } = await client
    .from('habit_logs')
    .insert({ user_id: userId, habit_id: habitId, completed_at: completedAt })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** List the user's habit completions, most recent first. */
export async function listHabitLogs(client: SupotsuClient, userId: string): Promise<HabitLogRow[]> {
  const { data, error } = await client
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Edit a habit's definition (name/pillar/cadence/target) — RLS scopes it to the owner. */
export async function updateHabit(
  client: SupotsuClient,
  habitId: string,
  patch: Pick<HabitInsertRow, 'name' | 'pillar' | 'cadence' | 'target_per_period'>,
): Promise<HabitRow> {
  const { data, error } = await client.from('habits').update(patch).eq('id', habitId).select('*').single();
  if (error) throw error;
  return data;
}

/** Soft-delete: hides the habit from `listHabits` while keeping its log history and streaks. */
export async function archiveHabit(client: SupotsuClient, habitId: string): Promise<void> {
  const { error } = await client.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', habitId);
  if (error) throw error;
}

/** Undo one habit completion (e.g. unchecking today's box). */
export async function deleteHabitLog(client: SupotsuClient, logId: string): Promise<void> {
  const { error } = await client.from('habit_logs').delete().eq('id', logId);
  if (error) throw error;
}

/**
 * Persist newly earned badges. Idempotent via the (user_id, badge_id) unique
 * constraint so re-evaluating the same badge never duplicates it.
 */
export async function upsertEarnedBadges(
  client: SupotsuClient,
  rows: EarnedBadgeInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from('earned_badges')
    .upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** List the user's earned badges. */
export async function listEarnedBadges(
  client: SupotsuClient,
  userId: string,
): Promise<EarnedBadgeRow[]> {
  const { data, error } = await client
    .from('earned_badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
