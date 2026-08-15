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

/**
 * Insert an imported workout (e.g. Garmin FIT strength sets) and its sets,
 * deduped on (user_id, external_id) — re-importing the same export is a
 * no-op instead of doubling every set's volume. Returns null when the
 * workout already exists (nothing inserted).
 */
export async function upsertImportedWorkout(
  client: SupotsuClient,
  input: WorkoutInsertRow & { external_id: string },
  sets: Omit<WorkoutSetInsertRow, 'workout_id'>[],
): Promise<WorkoutRow | null> {
  const { data, error } = await client
    .from('workouts')
    .upsert(input, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('*');
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  if (sets.length > 0) {
    const { error: setError } = await client
      .from('workout_sets')
      .insert(sets.map((s) => ({ ...s, workout_id: row.id })));
    if (setError) throw setError;
  }
  return row;
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

/** Detailed logged set: exercise, reps, load and its parent workout. */
export interface LoggedSet {
  workoutId: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
}

/** All of the user's logged sets with reps/load, for progression suggestions. */
export async function listLoggedSets(client: SupotsuClient, _userId: string): Promise<LoggedSet[]> {
  // RLS scopes workout_sets to the caller's own workouts.
  const { data, error } = await client
    .from('workout_sets')
    .select('workout_id, exercise_id, order, reps, weight_kg');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    workoutId: r.workout_id,
    exerciseId: r.exercise_id,
    order: r.order,
    reps: r.reps,
    weightKg: r.weight_kg,
  }));
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

/** Insert a single planned session (no sets yet); returns the created row. */
export async function insertPlannedWorkout(
  client: SupotsuClient,
  input: Omit<WorkoutInsertRow, 'status'>,
): Promise<WorkoutRow> {
  const { data, error } = await client
    .from('workouts')
    .insert({ ...input, status: 'planned' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** The user's planned sessions, soonest first (past-due planned included). */
export async function listPlannedWorkouts(
  client: SupotsuClient,
  userId: string,
): Promise<WorkoutRow[]> {
  const { data, error } = await client
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'planned')
    .order('planned_for', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/** Update a workout's status (e.g. mark a planned session done or skipped). */
export async function updateWorkoutStatus(
  client: SupotsuClient,
  workoutId: string,
  status: WorkoutRow['status'],
  completedAt?: string | null,
): Promise<WorkoutRow> {
  const patch: Database['public']['Tables']['workouts']['Update'] = { status };
  if (completedAt !== undefined) patch.completed_at = completedAt;
  const { data, error } = await client
    .from('workouts')
    .update(patch)
    .eq('id', workoutId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Delete a workout (RLS scopes to the owner). */
export async function deleteWorkout(client: SupotsuClient, workoutId: string): Promise<void> {
  const { error } = await client.from('workouts').delete().eq('id', workoutId);
  if (error) throw error;
}
