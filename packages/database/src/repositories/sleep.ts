import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

export type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row'];
export type SleepSessionInsertRow = Database['public']['Tables']['sleep_sessions']['Insert'];

/** Insert many sleep sessions at once (import). Idempotent via the dedup index. */
export async function insertSleepSessions(
  client: SupotsuClient,
  rows: SleepSessionInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  // Re-syncing the same night from the same source (e.g. after a parser fix
  // like adding hypnogram segments) should refresh the row, not silently
  // no-op forever — full upsert (update on conflict) instead of ignoring it.
  const { error } = await client
    .from('sleep_sessions')
    .upsert(rows, { onConflict: 'user_id,started_at,source' });
  if (error) throw error;
}

/** Insert one sleep session and return the row as the DB actually recorded it (real id, created_at) — for a caller that needs to hand the result back to the UI immediately, unlike the fire-and-forget bulk import path above. */
export async function insertSleepSession(
  client: SupotsuClient,
  row: SleepSessionInsertRow,
): Promise<SleepSessionRow> {
  const { data, error } = await client.from('sleep_sessions').insert(row).select().single();
  if (error) throw error;
  return data;
}

/** List the user's sleep sessions, most recent night first. */
export async function listSleepSessions(
  client: SupotsuClient,
  userId: string,
): Promise<SleepSessionRow[]> {
  return fetchAllPages((from, to) =>
    client
      .from('sleep_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(from, to),
  );
}
