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
 * Default weighting for the overall Supotsu Performance Score
 * (Master Prompt P34.4). Weights are adjustable per user profile.
 */
export const OVERALL_SCORE_WEIGHTS = {
  performance: 0.35,
  recovery: 0.25,
  consistency: 0.2,
  progression: 0.2,
} as const;
