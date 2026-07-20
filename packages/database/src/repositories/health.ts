import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type HealthMetricRow = Database['public']['Tables']['health_metrics']['Row'];
export type HealthMetricInsertRow = Database['public']['Tables']['health_metrics']['Insert'];

/** Insert many health metrics at once (connector import). */
export async function insertHealthMetrics(
  client: SupotsuClient,
  rows: HealthMetricInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from('health_metrics').insert(rows);
  if (error) throw error;
}

/** List the user's health metrics, most recent first. */
export async function listHealthMetrics(
  client: SupotsuClient,
  userId: string,
): Promise<HealthMetricRow[]> {
  const { data, error } = await client
    .from('health_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
