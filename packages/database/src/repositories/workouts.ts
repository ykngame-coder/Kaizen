import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type WorkoutRow = Database['public']['Tables']['workouts']['Row'];
export type WorkoutInsertRow = Database['public']['Tables']['workouts']['Insert'];
export type WorkoutSetInsertRow = Database['public']['Tables']['workout_sets']['Insert'];
export type WorkoutBlockRow = Database['public']['Tables']['workout_blocks']['Row'];
export type WorkoutBlockInsertRow = Database['public']['Tables']['workout_blocks']['Insert'];

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
 * Create a session made of one or more ordered blocks (AMRAP/EMOM/Pour le
 * temps/strength) — each block's exercises are its own workout_sets rows,
 * tagged with block_id. Sequential inserts (workout, then each block, then
 * that block's sets) rather than one giant statement: a session is created
 * once by hand, not in a hot loop, and this keeps error attribution clear
 * (which block failed) over a marginal round-trip savings.
 */
export async function insertWorkoutWithBlocks(
  client: SupotsuClient,
  workout: WorkoutInsertRow,
  blocks: {
    format: WorkoutBlockRow['format'];
    timeCapSec?: number;
    targetRounds?: number;
    sets: Omit<WorkoutSetInsertRow, 'workout_id' | 'block_id'>[];
  }[],
): Promise<WorkoutRow> {
  const { data: workoutRow, error } = await client.from('workouts').insert(workout).select('*').single();
  if (error) throw error;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const { data: blockRow, error: blockError } = await client
      .from('workout_blocks')
      .insert({
        workout_id: workoutRow.id,
        order: i,
        format: b.format,
        time_cap_sec: b.timeCapSec ?? null,
        target_rounds: b.targetRounds ?? null,
      })
      .select('*')
      .single();
    if (blockError) throw blockError;

    if (b.sets.length > 0) {
      const { error: setError } = await client
        .from('workout_sets')
        .insert(b.sets.map((s) => ({ ...s, workout_id: workoutRow.id, block_id: blockRow.id })));
      if (setError) throw setError;
    }
  }

  return workoutRow;
}

/** A session's blocks, in order. */
export async function listBlocksForWorkout(client: SupotsuClient, workoutId: string): Promise<WorkoutBlockRow[]> {
  const { data, error } = await client
    .from('workout_blocks')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One block's exercises, in order (RLS scopes workout_blocks/workout_sets to the caller's own workouts). */
export async function listSetsForBlock(client: SupotsuClient, blockId: string): Promise<WorkoutSetRow[]> {
  const { data, error } = await client
    .from('workout_sets')
    .select('*')
    .eq('block_id', blockId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Record a finished timed block's result (rounds completed / elapsed time). */
export async function updateBlockResult(
  client: SupotsuClient,
  blockId: string,
  result: { completedRounds?: number; resultTimeSec?: number },
): Promise<WorkoutBlockRow> {
  const { data, error } = await client
    .from('workout_blocks')
    .update({
      completed_rounds: result.completedRounds ?? null,
      result_time_sec: result.resultTimeSec ?? null,
    })
    .eq('id', blockId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Insert imported workouts (e.g. Garmin FIT strength sets) and their sets,
 * deduped on (user_id, external_id) — re-importing the same export is a
 * no-op instead of doubling every set's volume. One upsert + one insert for
 * the whole batch, not two sequential round-trips per workout: a real
 * multi-year Garmin export can carry hundreds of past strength sessions, and
 * awaiting each one in turn made that import slow and — worse — meant a
 * single transient network error anywhere in the sequence aborted the entire
 * import with no partial progress. Returns how many workouts were newly
 * created (existing ones are skipped, not double-inserted).
 */
export async function upsertImportedWorkouts(
  client: SupotsuClient,
  workouts: (WorkoutInsertRow & { external_id: string })[],
  setsByExternalId: Map<string, Omit<WorkoutSetInsertRow, 'workout_id'>[]>,
): Promise<number> {
  if (workouts.length === 0) return 0;
  const { data, error } = await client
    .from('workouts')
    .upsert(workouts, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('id, external_id');
  if (error) throw error;
  const created = data ?? [];
  const allSets = created.flatMap((row) =>
    (setsByExternalId.get(row.external_id ?? '') ?? []).map((s) => ({ ...s, workout_id: row.id })),
  );
  if (allSets.length > 0) {
    const { error: setError } = await client.from('workout_sets').insert(allSets);
    if (setError) throw setError;
  }
  return created.length;
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

/** Attach a connected watch's avg/max heart rate to a completed workout — RLS scopes it to the owner. Never called with a summary the caller hasn't already computed as non-null. */
export async function updateWorkoutHeartRate(
  client: SupotsuClient,
  workoutId: string,
  summary: { avgHeartRate: number; maxHeartRate: number },
): Promise<WorkoutRow> {
  const { data, error } = await client
    .from('workouts')
    .update({ avg_heart_rate: summary.avgHeartRate, max_heart_rate: summary.maxHeartRate })
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

export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row'];

/** The sets belonging to one specific workout, in order — for a session's editable detail view (RLS scopes workout_sets to the caller's own workouts). */
export async function listSetsForWorkout(client: SupotsuClient, workoutId: string): Promise<WorkoutSetRow[]> {
  const { data, error } = await client
    .from('workout_sets')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Update a workout's editable fields (name/notes) — not status, use updateWorkoutStatus for that. */
export async function updateWorkout(
  client: SupotsuClient,
  workoutId: string,
  patch: { name?: string; notes?: string | null },
): Promise<WorkoutRow> {
  const { data, error } = await client.from('workouts').update(patch).eq('id', workoutId).select('*').single();
  if (error) throw error;
  return data;
}

/** Replace a workout's sets wholesale (delete then insert) — simplest correct way to persist an edited exercise/rep list without diffing. */
export async function replaceWorkoutSets(
  client: SupotsuClient,
  workoutId: string,
  sets: Omit<WorkoutSetInsertRow, 'workout_id'>[],
): Promise<void> {
  const { error: delError } = await client.from('workout_sets').delete().eq('workout_id', workoutId);
  if (delError) throw delError;
  if (sets.length === 0) return;
  const { error: insError } = await client.from('workout_sets').insert(sets.map((s) => ({ ...s, workout_id: workoutId })));
  if (insError) throw insError;
}

/**
 * Replace a workout's blocks (and each block's sets) wholesale — same
 * delete-then-insert approach as replaceWorkoutSets, block-aware version.
 * Deleting workout_blocks cascades to their workout_sets rows; any
 * leftover blockless sets (e.g. the workout used to be flat) are cleared
 * too so the workout ends up purely block-structured.
 */
export async function replaceWorkoutBlocks(
  client: SupotsuClient,
  workoutId: string,
  blocks: {
    format: WorkoutBlockRow['format'];
    timeCapSec?: number;
    targetRounds?: number;
    sets: Omit<WorkoutSetInsertRow, 'workout_id' | 'block_id'>[];
  }[],
): Promise<void> {
  const { error: delBlocksError } = await client.from('workout_blocks').delete().eq('workout_id', workoutId);
  if (delBlocksError) throw delBlocksError;
  const { error: delSetsError } = await client.from('workout_sets').delete().eq('workout_id', workoutId);
  if (delSetsError) throw delSetsError;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const { data: blockRow, error: blockError } = await client
      .from('workout_blocks')
      .insert({
        workout_id: workoutId,
        order: i,
        format: b.format,
        time_cap_sec: b.timeCapSec ?? null,
        target_rounds: b.targetRounds ?? null,
      })
      .select('*')
      .single();
    if (blockError) throw blockError;

    if (b.sets.length > 0) {
      const { error: setError } = await client
        .from('workout_sets')
        .insert(b.sets.map((s) => ({ ...s, workout_id: workoutId, block_id: blockRow.id })));
      if (setError) throw setError;
    }
  }
}
