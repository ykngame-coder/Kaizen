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
