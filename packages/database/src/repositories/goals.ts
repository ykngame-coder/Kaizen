import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type GoalRow = Database['public']['Tables']['goals']['Row'];
export type GoalInsert = Database['public']['Tables']['goals']['Insert'];

/** Insert a goal owned by the current user. */
export async function insertGoal(client: SupotsuClient, input: GoalInsert): Promise<GoalRow> {
  const { data, error } = await client.from('goals').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

/** List the user's goals, most recent first. */
export async function listGoals(client: SupotsuClient, userId: string): Promise<GoalRow[]> {
  const { data, error } = await client
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
