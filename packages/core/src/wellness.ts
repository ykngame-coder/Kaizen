import type { ISODateString, OwnedEntity } from './common';

/**
 * A daily mental-wellness check-in (Master Prompt P14 bien-être mental): the
 * user's own read on how they feel. Subjective by design — stored alongside the
 * objective health metrics, never merged with them.
 */
export interface WellnessCheckin extends OwnedEntity {
  /** Overall mood, 1 (bad) … 5 (great). */
  mood: number;
  /** Perceived energy, 1 (drained) … 5 (energised). */
  energy: number;
  /** Perceived stress, 1 (calm) … 5 (overwhelmed). */
  stress: number;
  note?: string;
  checkedAt: ISODateString;
}
