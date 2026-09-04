import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

export type ActivityRow = Database['public']['Tables']['activities']['Row'];
export type ActivityInsertRow = Database['public']['Tables']['activities']['Insert'];

/** Insert an activity owned by the current user. */
export async function insertActivity(
  client: SupotsuClient,
  input: ActivityInsertRow,
): Promise<ActivityRow> {
  const { data, error } = await client.from('activities').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

/** Set (or clear) an activity's self-reported worked muscles — RLS scopes it to the owner. */
export async function updateActivityMuscles(
  client: SupotsuClient,
  activityId: string,
  muscles: string[],
): Promise<ActivityRow> {
  const { data, error } = await client
    .from('activities')
    .update({ muscles })
    .eq('id', activityId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Attach a connected watch's avg/max heart rate to an activity — only ever called by the caller when the activity doesn't already have one (never overwrites a manual entry or an import). RLS scopes it to the owner. */
export async function updateActivityHeartRate(
  client: SupotsuClient,
  activityId: string,
  summary: { avgHeartRate: number; maxHeartRate: number },
): Promise<ActivityRow> {
  const { data, error } = await client
    .from('activities')
    .update({ avg_heart_rate: summary.avgHeartRate, max_heart_rate: summary.maxHeartRate })
    .eq('id', activityId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Bulk upsert activities (bulk import). Idempotent via the
 * (user_id, source, external_id) unique index, so re-importing the same export
 * adds nothing. Rows are chunked to keep requests reasonable.
 */
export async function upsertActivities(
  client: SupotsuClient,
  rows: ActivityInsertRow[],
): Promise<void> {
  const withId = rows.filter((r) => r.external_id);
  const withoutId = rows.filter((r) => !r.external_id);
  const chunk = <T>(a: T[], n: number): T[][] =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  for (const part of chunk(withId, 500)) {
    const { error } = await client
      .from('activities')
      .upsert(part, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  // Rows without an external id can't be deduped; insert them plainly.
  for (const part of chunk(withoutId, 500)) {
    const { error } = await client.from('activities').insert(part);
    if (error) throw error;
  }
}

/** Remove a single activity (e.g. a duplicate or unwanted import). */
export async function deleteActivity(client: SupotsuClient, activityId: string): Promise<void> {
  const { error } = await client.from('activities').delete().eq('id', activityId);
  if (error) throw error;
}

/** List the user's activities, most recent first. */
export async function listActivities(
  client: SupotsuClient,
  userId: string,
): Promise<ActivityRow[]> {
  return fetchAllPages((from, to) =>
    client
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(from, to),
  );
}
