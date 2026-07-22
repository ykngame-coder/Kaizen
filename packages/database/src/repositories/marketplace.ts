import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type ProgramRow = Database['public']['Tables']['programs']['Row'];
export type ProgramEnrollmentRow = Database['public']['Tables']['program_enrollments']['Row'];

/** List the marketplace catalogue. */
export async function listPrograms(client: SupotsuClient): Promise<ProgramRow[]> {
  const { data, error } = await client.from('programs').select('*').order('title');
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

/** Enroll in a program (idempotent via the unique (user, program) constraint). */
export async function enrollInProgram(
  client: SupotsuClient,
  userId: string,
  programId: string,
): Promise<void> {
  const { error } = await client
    .from('program_enrollments')
    .upsert(
      { user_id: userId, program_id: programId, status: 'active' },
      { onConflict: 'user_id,program_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}
