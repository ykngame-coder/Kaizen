import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type WorkoutRow = Database['public']['Tables']['workouts']['Row'];
export type WorkoutInsertRow = Database['public']['Tables']['workouts']['Insert'];
export type WorkoutSetInsertRow = Database['public']['Tables']['workout_sets']['Insert'];

/** Insert a workout and its sets; returns the created workout. */
export async function insertWorkout(
  client: SupotsuClient,
  input: WorkoutInsertRow,
  sets: Omit<WorkoutSetInsertRow, 'workout_id'>[],
): Promise<WorkoutRow> {
  const { data, error } = await client.from('workouts').insert(input).select('*').single();
  if (error) throw error;
  if (sets.length > 0) {
    const { error: setError } = await client
      .from('workout_sets')
      .insert(sets.map((s) => ({ ...s, workout_id: data.id })));
    if (setError) throw setError;
  }
  return data;
}

/** The user's logged sets (exercise id + parent workout), for the muscle map. */
export async function listWorkoutSetsForUser(
  client: SupotsuClient,
  _userId: string,
): Promise<{ workoutId: string; exerciseId: string }[]> {
  // RLS scopes workout_sets to the caller's own workouts.
  const { data, error } = await client.from('workout_sets').select('workout_id, exercise_id');
  if (error) throw error;
  return (data ?? []).map((r) => ({ workoutId: r.workout_id, exerciseId: r.exercise_id }));
}

/** List the user's workouts, most recent first. */
export async function listWorkouts(client: SupotsuClient, userId: string): Promise<WorkoutRow[]> {
  const { data, error } = await client
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
