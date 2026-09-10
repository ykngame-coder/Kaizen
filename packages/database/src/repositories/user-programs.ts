import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type UserSessionRow = Database['public']['Tables']['user_sessions']['Row'];
export type UserSessionInsertRow = Database['public']['Tables']['user_sessions']['Insert'];
export type UserSessionExerciseRow = Database['public']['Tables']['user_session_exercises']['Row'];
export type UserSessionExerciseInsertRow = Database['public']['Tables']['user_session_exercises']['Insert'];
export type UserSessionBlockRow = Database['public']['Tables']['user_session_blocks']['Row'];
export type UserSessionBlockInsertRow = Database['public']['Tables']['user_session_blocks']['Insert'];
export type UserProgramRow = Database['public']['Tables']['user_programs']['Row'];
export type UserProgramInsertRow = Database['public']['Tables']['user_programs']['Insert'];
export type UserProgramSessionRow = Database['public']['Tables']['user_program_sessions']['Row'];
export type UserProgramSessionInsertRow = Database['public']['Tables']['user_program_sessions']['Insert'];

/** The caller's own session library. */
export async function listUserSessions(client: SupotsuClient, userId: string): Promise<UserSessionRow[]> {
  const { data, error } = await client
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Public sessions from other users (Communauté tab). */
export async function listCommunitySessions(client: SupotsuClient, userId: string): Promise<UserSessionRow[]> {
  const { data, error } = await client
    .from('user_sessions')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single session — RLS allows it through when public or owned. */
export async function getUserSession(client: SupotsuClient, sessionId: string): Promise<UserSessionRow | null> {
  const { data, error } = await client.from('user_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSessionExercises(
  client: SupotsuClient,
  sessionId: string,
): Promise<UserSessionExerciseRow[]> {
  const { data, error } = await client
    .from('user_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** A session's blocks, in order — empty for a session saved before block support existed. */
export async function listSessionBlocks(
  client: SupotsuClient,
  sessionId: string,
): Promise<UserSessionBlockRow[]> {
  const { data, error } = await client
    .from('user_session_blocks')
    .select('*')
    .eq('session_id', sessionId)
    .order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface SessionBlockWrite {
  format: UserSessionBlockRow['format'];
  /** AMRAP cap, EMOM interval, or Tabata work duration. */
  timeCapSec?: number;
  /** Tabata rest. */
  restSec?: number;
  targetRounds?: number;
  exercises: Omit<UserSessionExerciseInsertRow, 'session_id' | 'block_id'>[];
}

/** Writes the block/exercise rows of a session that already exists. */
async function writeSessionBlocks(
  client: SupotsuClient,
  sessionId: string,
  blocks: SessionBlockWrite[],
): Promise<void> {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const { data: blockRow, error: blockError } = await client
      .from('user_session_blocks')
      .insert({
        session_id: sessionId,
        order: i,
        format: b.format,
        time_cap_sec: b.timeCapSec ?? null,
        rest_sec: b.restSec ?? null,
        target_rounds: b.targetRounds ?? null,
      })
      .select('*')
      .single();
    if (blockError) throw blockError;

    if (b.exercises.length > 0) {
      const { error: exError } = await client
        .from('user_session_exercises')
        .insert(b.exercises.map((e) => ({ ...e, session_id: sessionId, block_id: blockRow.id })));
      if (exError) throw exError;
    }
  }
}

/** Insert a session made of one or more blocks; the quota trigger rejects past the 50 limit. */
export async function insertUserSession(
  client: SupotsuClient,
  input: UserSessionInsertRow,
  blocks: SessionBlockWrite[],
): Promise<UserSessionRow> {
  const { data, error } = await client.from('user_sessions').insert(input).select('*').single();
  if (error) throw error;
  await writeSessionBlocks(client, data.id, blocks);
  return data;
}

/**
 * Overwrite a session's name, visibility, notes and whole block/exercise content.
 *
 * Replacement, not a merge: the editor hands back the complete session, and
 * reconciling row by row would buy nothing. Exercises are cleared by
 * `session_id` rather than relying on the blocks' cascade — a session saved
 * before block support has `block_id` null on every exercise, so dropping the
 * blocks alone would strand them and they would reappear alongside the new
 * ones.
 *
 * The replacement is several statements with no transaction between them, so a
 * failure partway (quota, network, RLS) would leave the session emptied. The
 * old content is therefore read back first and restored if anything downstream
 * throws, so a failed edit leaves the session exactly as it was.
 */
export async function updateUserSession(
  client: SupotsuClient,
  sessionId: string,
  patch: { name: string; visibility: 'private' | 'public'; notes?: string | null },
  blocks: SessionBlockWrite[],
): Promise<UserSessionRow> {
  // Snapshot avant toute destruction — c'est ce qui permet de revenir en
  // arrière si une insertion échoue à mi-chemin.
  const previousBlocks = await listSessionBlocks(client, sessionId);
  const previousExercises = await listSessionExercises(client, sessionId);
  const previous = await getUserSession(client, sessionId);

  const { data, error } = await client
    .from('user_sessions')
    .update({ name: patch.name, visibility: patch.visibility, notes: patch.notes ?? null })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw error;

  try {
    const { error: exError } = await client.from('user_session_exercises').delete().eq('session_id', sessionId);
    if (exError) throw exError;
    const { error: blockError } = await client.from('user_session_blocks').delete().eq('session_id', sessionId);
    if (blockError) throw blockError;

    await writeSessionBlocks(client, sessionId, blocks);
  } catch (e) {
    await restoreSessionContent(client, sessionId, previous, previousBlocks, previousExercises);
    throw e;
  }
  return data;
}

/**
 * Put back a session's previous content after a failed replacement. Best
 * effort: if the restore itself fails there is nothing further to try, and the
 * original error — the one worth showing — must not be masked by this one.
 */
async function restoreSessionContent(
  client: SupotsuClient,
  sessionId: string,
  previous: UserSessionRow | null,
  blocks: UserSessionBlockRow[],
  exercises: UserSessionExerciseRow[],
): Promise<void> {
  try {
    await client.from('user_session_exercises').delete().eq('session_id', sessionId);
    await client.from('user_session_blocks').delete().eq('session_id', sessionId);
    if (previous) {
      await client
        .from('user_sessions')
        .update({ name: previous.name, visibility: previous.visibility, notes: previous.notes })
        .eq('id', sessionId);
    }
    for (const b of blocks) {
      const { data: row } = await client
        .from('user_session_blocks')
        .insert({ session_id: sessionId, order: b.order, format: b.format, time_cap_sec: b.time_cap_sec, target_rounds: b.target_rounds, rest_sec: b.rest_sec })
        .select('*')
        .single();
      if (!row) continue;
      const its = exercises.filter((e) => e.block_id === b.id);
      if (its.length > 0) {
        await client.from('user_session_exercises').insert(
          its.map((e) => ({
            session_id: sessionId,
            block_id: row.id,
            exercise_id: e.exercise_id,
            order: e.order,
            reps: e.reps,
            weight_kg: e.weight_kg,
            duration_sec: e.duration_sec,
            rest_sec: e.rest_sec,
          })),
        );
      }
    }
    // Séance héritée : des exercices sans bloc, qu'il faut remettre tels quels.
    const orphans = exercises.filter((e) => !e.block_id);
    if (orphans.length > 0) {
      await client.from('user_session_exercises').insert(
        orphans.map((e) => ({
          session_id: sessionId,
          block_id: null,
          exercise_id: e.exercise_id,
          order: e.order,
          reps: e.reps,
          weight_kg: e.weight_kg,
          duration_sec: e.duration_sec,
          rest_sec: e.rest_sec,
        })),
      );
    }
  } catch {
    /* voir le commentaire ci-dessus */
  }
}

export async function updateUserSessionVisibility(
  client: SupotsuClient,
  sessionId: string,
  visibility: 'private' | 'public',
): Promise<void> {
  const { error } = await client.from('user_sessions').update({ visibility }).eq('id', sessionId);
  if (error) throw error;
}

export async function deleteUserSession(client: SupotsuClient, sessionId: string): Promise<void> {
  const { error } = await client.from('user_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

/** The caller's own programs. */
export async function listUserPrograms(client: SupotsuClient, userId: string): Promise<UserProgramRow[]> {
  const { data, error } = await client
    .from('user_programs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Public programs from other users (Communauté tab). */
export async function listCommunityPrograms(client: SupotsuClient, userId: string): Promise<UserProgramRow[]> {
  const { data, error } = await client
    .from('user_programs')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getUserProgram(client: SupotsuClient, programId: string): Promise<UserProgramRow | null> {
  const { data, error } = await client.from('user_programs').select('*').eq('id', programId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listProgramSessions(
  client: SupotsuClient,
  programId: string,
): Promise<UserProgramSessionRow[]> {
  const { data, error } = await client
    .from('user_program_sessions')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true })
    .order('day_index', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Insert a program; the quota trigger rejects past the 2 limit. */
export async function insertUserProgram(client: SupotsuClient, input: UserProgramInsertRow): Promise<UserProgramRow> {
  const { data, error } = await client.from('user_programs').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Edit a program's own fields. Its week/day schedule lives in
 * `user_program_sessions` and is edited on the planning screen, so it is
 * deliberately left alone here — shortening `weeks` does not prune slots.
 */
export async function updateUserProgram(
  client: SupotsuClient,
  programId: string,
  patch: Pick<UserProgramInsertRow, 'title' | 'focus' | 'level' | 'weeks' | 'description' | 'visibility'>,
): Promise<UserProgramRow> {
  const { data, error } = await client.from('user_programs').update(patch).eq('id', programId).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateUserProgramVisibility(
  client: SupotsuClient,
  programId: string,
  visibility: 'private' | 'public',
): Promise<void> {
  const { error } = await client.from('user_programs').update({ visibility }).eq('id', programId);
  if (error) throw error;
}

export async function deleteUserProgram(client: SupotsuClient, programId: string): Promise<void> {
  const { error } = await client.from('user_programs').delete().eq('id', programId);
  if (error) throw error;
}

/** Place a session at a week/day slot in a program's schedule. */
export async function insertProgramSession(
  client: SupotsuClient,
  input: UserProgramSessionInsertRow,
): Promise<UserProgramSessionRow> {
  const { data, error } = await client.from('user_program_sessions').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteProgramSession(client: SupotsuClient, programSessionId: string): Promise<void> {
  const { error } = await client.from('user_program_sessions').delete().eq('id', programSessionId);
  if (error) throw error;
}
