import type { ISODateString, OwnedEntity } from './common';
import type { SportLevel } from './user';

/** Training focus of a marketplace program (Master Prompt P39 marketplace). */
export type ProgramFocus =
  | 'strength'
  | 'endurance'
  | 'hyrox'
  | 'weight_loss'
  | 'mobility'
  | 'general';

/** One target exercise within a program session template — reps are a target, not a prescription of load. */
export interface ProgramSessionExercise {
  exerciseId: string;
  sets: number;
  reps: number;
}

/** One session's content within a program's structure — either exercise-based (strength/mobility) or free-text (e.g. a running interval structure). */
export interface ProgramSessionTemplate {
  title: string;
  notes?: string;
  exercises?: ProgramSessionExercise[];
}

/**
 * A coach-authored program in the marketplace catalogue. World-readable like the
 * exercise library; users enroll but never edit it.
 */
export interface Program {
  id: string;
  title: string;
  author: string;
  focus: ProgramFocus;
  level: SportLevel;
  weeks: number;
  sessionsPerWeek: number;
  description: string;
  /** 0 = gratuit. Prices are in cents to avoid float rounding. */
  priceCents: number;
  /**
   * Flat, ordered list of sessions across the whole program — one entry per
   * calendar slot generated on enrollment (see `packages/engines` schedule
   * generator). Length is normally weeks × sessionsPerWeek; shorter arrays
   * are cycled (a repeating weekly pattern), so a program with the same 3
   * sessions every week only needs 3 entries, not 24.
   */
  sessionTemplates: ProgramSessionTemplate[];
}

export type EnrollmentStatus = 'active' | 'completed' | 'abandoned';

/** A user's enrollment in a program (owner-scoped). */
export interface ProgramEnrollment extends OwnedEntity {
  programId: string;
  startedAt: ISODateString;
  status: EnrollmentStatus;
}
