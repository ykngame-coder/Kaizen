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
}

export type EnrollmentStatus = 'active' | 'completed' | 'abandoned';

/** A user's enrollment in a program (owner-scoped). */
export interface ProgramEnrollment extends OwnedEntity {
  programId: string;
  startedAt: ISODateString;
  status: EnrollmentStatus;
}
