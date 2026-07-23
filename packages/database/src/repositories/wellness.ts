import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type WellnessCheckinRow = Database['public']['Tables']['wellness_checkins']['Row'];
export type WellnessCheckinInsertRow = Database['public']['Tables']['wellness_checkins']['Insert'];

/** Record one wellness check-in. */
export async function insertWellnessCheckin(
  client: SupotsuClient,
  row: WellnessCheckinInsertRow,
): Promise<WellnessCheckinRow> {
  const { data, error } = await client.from('wellness_checkins').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/** List the user's wellness check-ins, most recent first. */
export async function listWellnessCheckins(
  client: SupotsuClient,
  userId: string,
): Promise<WellnessCheckinRow[]> {
  const { data, error } = await client
    .from('wellness_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('checked_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
