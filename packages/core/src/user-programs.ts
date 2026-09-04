import type { OwnedEntity, UUID } from './common';
import type { ProgramFocus } from './marketplace';
import type { BlockFormat } from './training';
import type { SportLevel } from './user';

export type Visibility = 'private' | 'public';

/**
 * A reusable session template the user built themselves — independent of any
 * program, can be scheduled into any number of them, or started standalone
 * (Master Prompt-adjacent: user-generated content, private by default).
 */
export interface UserSession extends OwnedEntity {
  name: string;
  notes?: string;
  visibility: Visibility;
}

export interface UserSessionExercise {
  id: UUID;
  sessionId: UUID;
  /** The block this exercise belongs to — absent for a session saved before block support existed (treated as a legacy flat session everywhere it's read). */
  blockId?: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
}

/** One block within a user-created session template (mirrors WorkoutBlock). */
export interface UserSessionBlock {
  id: UUID;
  sessionId: UUID;
  order: number;
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
}

/** A user-authored multi-week program — the editable counterpart to the coach `Program` catalogue. */
export interface UserProgram extends OwnedEntity {
  title: string;
  focus: ProgramFocus;
  level: SportLevel;
  weeks: number;
  description?: string;
  visibility: Visibility;
}

/** One slot in a program's week×day schedule, pointing at a session in the owner's library. */
export interface UserProgramSession {
  id: UUID;
  programId: UUID;
  sessionId: UUID;
  weekNumber: number;
  /** 0 = Monday .. 6 = Sunday. */
  dayIndex: number;
  order: number;
}
