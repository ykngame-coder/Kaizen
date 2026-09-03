import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

export type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row'];
export type SleepSessionInsertRow = Database['public']['Tables']['sleep_sessions']['Insert'];

/**
 * Collapse rows that share the table's unique key (user_id, started_at,
 * source) to their last occurrence. A single upsert statement can't apply
 * ON CONFLICT DO UPDATE twice to the same row — Postgres raises "cannot
 * affect row a second time" if two rows in the same batch collide on the
 * unique index (e.g. a HealthKit sync whose sample fetch produced two
 * overlapping sessions for what is really one night).
 */
export function dedupeSleepSessionRows(rows: SleepSessionInsertRow[]): SleepSessionInsertRow[] {
  const byKey = new Map<string, SleepSessionInsertRow>();
  for (const row of rows) byKey.set(`${row.user_id}|${row.started_at}|${row.source}`, row);
  return [...byKey.values()];
}

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
    .upsert(dedupeSleepSessionRows(rows), { onConflict: 'user_id,started_at,source' });
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
