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

/** Update a goal's current value + progress (RLS scopes it to the owner). */
export async function updateGoalCurrent(
  client: SupotsuClient,
  goalId: string,
  currentValue: number,
  progress: number,
  status: GoalRow['status'],
): Promise<GoalRow> {
  const { data, error } = await client
    .from('goals')
    .update({ current_value: currentValue, progress, status })
    .eq('id', goalId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Edit a goal's definition (title/type/target) — RLS scopes it to the owner. */
export async function updateGoal(
  client: SupotsuClient,
  goalId: string,
  patch: Pick<GoalInsert, 'title' | 'type' | 'target_value' | 'target_unit'>,
): Promise<GoalRow> {
  const { data, error } = await client.from('goals').update(patch).eq('id', goalId).select('*').single();
  if (error) throw error;
  return data;
}

/** Delete a goal (RLS scopes it to the owner). */
export async function deleteGoal(client: SupotsuClient, goalId: string): Promise<void> {
  const { error } = await client.from('goals').delete().eq('id', goalId);
  if (error) throw error;
}
