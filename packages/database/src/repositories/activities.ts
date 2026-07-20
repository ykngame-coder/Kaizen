import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

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

/** List the user's activities, most recent first. */
export async function listActivities(
  client: SupotsuClient,
  userId: string,
): Promise<ActivityRow[]> {
  const { data, error } = await client
    .from('activities')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
