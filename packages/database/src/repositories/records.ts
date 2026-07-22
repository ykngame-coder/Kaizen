import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type RecordRow = Database['public']['Tables']['records']['Row'];
export type RecordInsertRow = Database['public']['Tables']['records']['Insert'];

/**
 * Bulk upsert records (import). Idempotent via the (user_id, source, external_id)
 * unique index. Rows without an external id are inserted plainly.
 */
export async function upsertRecords(client: SupotsuClient, rows: RecordInsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const withId = rows.filter((r) => r.external_id);
  const withoutId = rows.filter((r) => !r.external_id);
  if (withId.length > 0) {
    const { error } = await client
      .from('records')
      .upsert(withId, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (withoutId.length > 0) {
    const { error } = await client.from('records').insert(withoutId);
    if (error) throw error;
  }
}

/** List the user's records, most recent achievement first. */
export async function listRecords(client: SupotsuClient, userId: string): Promise<RecordRow[]> {
  const { data, error } = await client
    .from('records')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
