import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type ProgramRow = Database['public']['Tables']['programs']['Row'];
export type ProgramSessionRow = Database['public']['Tables']['program_sessions']['Row'];
export type ProgramEnrollmentRow = Database['public']['Tables']['program_enrollments']['Row'];

/** List the marketplace catalogue. */
export async function listPrograms(client: SupotsuClient): Promise<ProgramRow[]> {
  const { data, error } = await client.from('programs').select('*').order('title');
  if (error) throw error;
  return data ?? [];
}

/**
 * Les séances d'un programme : le lien, la semaine et l'ordre. Le contenu, lui,
 * vit dans la séance publique référencée.
 */
export async function listCatalogSessions(client: SupotsuClient): Promise<ProgramSessionRow[]> {
  const { data, error } = await client
    .from('program_sessions')
    .select('*')
    .order('week_number')
    .order('order');
  if (error) throw error;
  return data ?? [];
}

/** The user's program enrollments. */
export async function listEnrollments(
  client: SupotsuClient,
  userId: string,
): Promise<ProgramEnrollmentRow[]> {
  const { data, error } = await client
    .from('program_enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Enroll in a program. A conflict on (user, program) UPDATEs rather than being
 * ignored — otherwise re-enrolling after `unenrollFromProgram` (status stays
 * 'abandoned' on the same row, the unique constraint forbids a second one)
 * would silently do nothing.
 */
export async function enrollInProgram(
  client: SupotsuClient,
  userId: string,
  programId: string,
  startDate?: Date,
): Promise<void> {
  const { error } = await client
    .from('program_enrollments')
    .upsert(
      {
        user_id: userId,
        program_id: programId,
        status: 'active',
        ...(startDate ? { started_at: startDate.toISOString() } : {}),
      },
      { onConflict: 'user_id,program_id' },
    );
  if (error) throw error;
}

/**
 * Leave a program. Marks the enrollment 'abandoned' rather than deleting it —
 * the sessions already copied into the user's own Planification when they
 * enrolled are theirs now, independent of this row, and stay untouched.
 */
export async function unenrollFromProgram(
  client: SupotsuClient,
  userId: string,
  programId: string,
): Promise<void> {
  const { error } = await client
    .from('program_enrollments')
    .update({ status: 'abandoned' })
    .eq('user_id', userId)
    .eq('program_id', programId);
  if (error) throw error;
}
