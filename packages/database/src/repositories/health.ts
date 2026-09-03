import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

export type HealthMetricRow = Database['public']['Tables']['health_metrics']['Row'];
export type HealthMetricInsertRow = Database['public']['Tables']['health_metrics']['Insert'];

/** Collapse rows sharing the unique key to their last occurrence — a single upsert can't apply ON CONFLICT DO UPDATE twice to the same row in one statement. */
export function dedupeByConflictKey(rows: HealthMetricInsertRow[]): HealthMetricInsertRow[] {
  const byKey = new Map<string, HealthMetricInsertRow>();
  for (const row of rows) byKey.set(`${row.user_id}|${row.type}|${row.measured_at}|${row.source ?? ''}`, row);
  return [...byKey.values()];
}

/** Insert many health metrics at once (connector import). */
export async function insertHealthMetrics(
  client: SupotsuClient,
  rows: HealthMetricInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  // sleep_duration is a computed once-per-night aggregate keyed by a stable
  // per-night timestamp (see aggregateHealthKitSleep) — a resync should
  // refresh it, since HealthKit keeps finalizing a night's data across
  // repeated background syncs, not silently no-op like every other metric
  // type (a fresh weigh-in, an HRV reading, ...) whose insert-only,
  // ignore-exact-duplicate semantics are what actually keeps those idempotent.
  const sleepDuration = rows.filter((r) => r.type === 'sleep_duration');
  const rest = rows.filter((r) => r.type !== 'sleep_duration');
  if (rest.length > 0) {
    const { error } = await client
      .from('health_metrics')
      .upsert(rest, { onConflict: 'user_id,type,measured_at,source', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (sleepDuration.length > 0) {
    const { error } = await client
      .from('health_metrics')
      .upsert(dedupeByConflictKey(sleepDuration), { onConflict: 'user_id,type,measured_at,source' });
    if (error) throw error;
  }
}

/** List the user's health metrics, most recent first. */
export async function listHealthMetrics(
  client: SupotsuClient,
  userId: string,
): Promise<HealthMetricRow[]> {
  return fetchAllPages((from, to) =>
    client
      .from('health_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .range(from, to),
  );
}

/** Delete a single health metric entry (e.g. to resolve a duplicate). */
export async function deleteHealthMetric(client: SupotsuClient, metricId: string): Promise<void> {
  const { error } = await client.from('health_metrics').delete().eq('id', metricId);
  if (error) throw error;
}
