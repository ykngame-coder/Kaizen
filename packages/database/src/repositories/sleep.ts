import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row'];
export type SleepSessionInsertRow = Database['public']['Tables']['sleep_sessions']['Insert'];

/** Insert many sleep sessions at once (import). Idempotent via the dedup index. */
export async function insertSleepSessions(
  client: SupotsuClient,
  rows: SleepSessionInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from('sleep_sessions')
    .upsert(rows, { onConflict: 'user_id,started_at,source', ignoreDuplicates: true });
  if (error) throw error;
}

/** List the user's sleep sessions, most recent night first. */
export async function listSleepSessions(
  client: SupotsuClient,
  userId: string,
): Promise<SleepSessionRow[]> {
  const { data, error } = await client
    .from('sleep_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
