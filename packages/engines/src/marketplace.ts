import type { ISODateString, Program, ProgramFocus, SportLevel } from '@supotsu/core';
import type { EngineResult } from './result';

/**
 * Marketplace Engine (Master Prompt P39). Recommends a program by *transparent*
 * matching — level fit, focus vs the user's goal, and weekly availability — and
 * always explains why, with a confidence level. No opaque ranking.
 */

const LEVEL_ORDER: Record<SportLevel, number> = {
  beginner: 0,
  intermediate: 1,
  confirmed: 2,
  advanced: 3,
};

export interface RecommendationInputs {
  level?: SportLevel;
  goalFocus?: ProgramFocus;
  weeklyAvailability?: number;
}

/** Transparent 0-100 fit score between a user and a program. */
export function programFit(inputs: RecommendationInputs, program: Program): number {
  let score = 40; // baseline so every program is comparable
  if (inputs.goalFocus && program.focus === inputs.goalFocus) score += 30;
  if (inputs.level) {
    const gap = Math.abs(LEVEL_ORDER[program.level] - LEVEL_ORDER[inputs.level]);
    score += Math.max(0, 20 - gap * 10); // same level +20, one off +10
  }
  if (inputs.weeklyAvailability !== undefined) {
    // Reward programs that fit the available days; penalize overload.
    score += program.sessionsPerWeek <= inputs.weeklyAvailability ? 10 : -10;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Pick the best-fitting program with an explanation. Confidence reflects how
 * much profile signal backed the match (level + goal + availability).
 */
export function recommendProgram(
  inputs: RecommendationInputs,
  programs: Program[],
  asOf: ISODateString,
): EngineResult<Program | null> {
  if (programs.length === 0) {
    return { value: null, confidence: 'to_confirm', sourcesUsed: ['manual'], generatedAt: asOf };
  }
  const ranked = [...programs].sort((a, b) => programFit(inputs, b) - programFit(inputs, a));
  const best = ranked[0];
  if (!best) {
    return { value: null, confidence: 'to_confirm', sourcesUsed: ['manual'], generatedAt: asOf };
  }
  const signals = [inputs.level, inputs.goalFocus, inputs.weeklyAvailability].filter(
    (v) => v !== undefined,
  ).length;
  const confidence = signals >= 2 ? 'high' : signals === 1 ? 'medium' : 'to_confirm';

  return {
    value: best,
    confidence,
    explanation: {
      observation: `« ${best.title} » (${best.focus}, niveau ${best.level}).`,
      analysis:
        signals === 0
          ? 'Sélection par défaut : complète ton profil pour une reco personnalisée.'
          : `Correspond à ${inputs.goalFocus ? 'ton objectif' : 'ton profil'}${
              inputs.weeklyAvailability !== undefined ? ' et ta disponibilité hebdomadaire' : ''
            }.`,
      action: 'Ouvre le programme pour voir la structure avant de t’inscrire.',
    },
    sourcesUsed: ['manual'],
    generatedAt: asOf,
  };
}
