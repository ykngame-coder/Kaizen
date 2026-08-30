import type { Confidence, ISODateString, OwnedEntity } from './common';

/** The Supotsu score families (Master Prompt P10, P34.4). */
export type ScoreKind =
  'overall' | 'performance' | 'recovery' | 'consistency' | 'progression' | 'training_load';

/**
 * A computed score with the factors that produced it, so the UI can always
 * answer "pourquoi ce score ?" (Master Prompt P34.16 transparency).
 */
export interface SupotsuScore extends OwnedEntity {
  kind: ScoreKind;
  /** 0-100. */
  value: number;
  date: ISODateString;
  confidence: Confidence;
  /** Named contributing factors, each 0-1, for explainability. */
  factors: ScoreFactor[];
}

export interface ScoreFactor {
  label: string;
  weight: number; // 0-1, contribution to the score
  value: number; // 0-1, normalized factor value
}

/**
 * Default weighting for the overall Supotsu Score's five pillars (Master
 * Prompt P34.4). Weights are adjustable per user profile. Renormalized over
 * whichever pillars actually have data — see buildDailySnapshot. "active"
 * (NEAT — daily steps vs the user's goal) is deliberately the smallest
 * weight: a real, distinct signal from structured training (Sport), but a
 * secondary one — same rationale as Apple's own separate Move/Exercise
 * rings.
 */
export const OVERALL_SCORE_WEIGHTS = {
  sport: 0.25,
  recovery: 0.2,
  sleep: 0.2,
  nutrition: 0.2,
  active: 0.15,
} as const;

/**
 * Default weighting for the Sport pillar's sub-scores. ACWR/training-load is
 * deliberately excluded — it's shown as a standalone metric (Sport hub), not
 * folded into the score, to avoid double-counting training volume alongside
 * Performance and Progression.
 */
export const SPORT_SCORE_WEIGHTS = {
  performance: 0.4,
  regularity: 0.3,
  progression: 0.3,
} as const;
