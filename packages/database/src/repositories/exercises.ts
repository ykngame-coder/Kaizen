import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type ExerciseRow = Database['public']['Tables']['exercises']['Row'];
export type ExerciseInsertRow = Database['public']['Tables']['exercises']['Insert'];

/** Create a custom exercise (created_by is the owner — RLS restricts writes to the caller's own rows). */
export async function insertCustomExercise(client: SupotsuClient, row: ExerciseInsertRow): Promise<ExerciseRow> {
  const { data, error } = await client.from('exercises').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/** List the caller's own custom exercises (the built-in catalogue ships bundled with the app, not queried here). */
export async function listCustomExercises(client: SupotsuClient, userId: string): Promise<ExerciseRow[]> {
  const { data, error } = await client
    .from('exercises')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Postgres FK-violation code — thrown when workout_sets still references the exercise being deleted. */
export const FOREIGN_KEY_VIOLATION = '23503';

/** Delete one of the caller's own custom exercises (scoped by created_by; RLS backs this up). Rejects with the raw
 *  Postgres error (code `FOREIGN_KEY_VIOLATION`) if any workout_sets row still references it — never deleted. */
export async function deleteCustomExercise(client: SupotsuClient, userId: string, exerciseId: string): Promise<void> {
  const { error } = await client.from('exercises').delete().eq('id', exerciseId).eq('created_by', userId);
  if (error) throw error;
}
