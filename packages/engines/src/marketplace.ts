import type { ISODateString, Program, ProgramFocus, ProgramSessionExercise, SportLevel } from '@supotsu/core';
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
      observation: { key: 'engines.marketplace.observation', params: { title: best.title, focus: best.focus, level: best.level } },
      analysis:
        signals === 0
          ? { key: 'engines.marketplace.analysis.default' }
          : {
              key: inputs.goalFocus
                ? inputs.weeklyAvailability !== undefined
                  ? 'engines.marketplace.analysis.goalAndAvailability'
                  : 'engines.marketplace.analysis.goal'
                : inputs.weeklyAvailability !== undefined
                  ? 'engines.marketplace.analysis.profileAndAvailability'
                  : 'engines.marketplace.analysis.profile',
            },
      action: { key: 'engines.marketplace.action' },
    },
    sourcesUsed: ['manual'],
    generatedAt: asOf,
  };
}

/** Weekday index sets (Mon=0 … Sun=6) used to spread a program's sessions across the week, keyed by sessionsPerWeek. */
const WEEKDAY_PATTERNS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One `sets`×`reps` exercise expanded into individual set rows (order 0, 1, 2… across the whole session, matching workout_sets' one-row-per-set shape). */
function expandSets(exercises: ProgramSessionExercise[] | undefined): { exerciseId: string; order: number; reps: number }[] | undefined {
  if (!exercises || exercises.length === 0) return undefined;
  const out: { exerciseId: string; order: number; reps: number }[] = [];
  let order = 0;
  for (const ex of exercises) {
    for (let i = 0; i < ex.sets; i += 1) {
      out.push({ exerciseId: ex.exerciseId, order, reps: ex.reps });
      order += 1;
    }
  }
  return out;
}

export interface GeneratedProgramSession {
  name: string;
  /** Local calendar day, YYYY-MM-DD. */
  plannedFor: string;
  notes?: string;
  sets?: { exerciseId: string; order: number; reps: number }[];
}

/**
 * Turns a program's `sessionTemplates` into dated calendar entries, starting
 * the day after `startFrom` (so enrolling doesn't cram a session into
 * "today"), spread across the week per `sessionsPerWeek` (see
 * WEEKDAY_PATTERNS). Pure — the caller persists the result as planned
 * workouts.
 */
export function generateProgramSchedule(program: Program, startFrom: Date = new Date()): GeneratedProgramSession[] {
  const pattern = WEEKDAY_PATTERNS[Math.min(7, Math.max(1, program.sessionsPerWeek))] ?? WEEKDAY_PATTERNS[3]!;
  const sessions = program.sessionTemplates;
  const out: GeneratedProgramSession[] = [];
  const cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), startFrom.getDate() + 1);
  let i = 0;
  let safety = 0;
  while (i < sessions.length && safety < 3650) {
    safety += 1;
    const dow = (cursor.getDay() + 6) % 7; // Mon=0 … Sun=6
    if (pattern.includes(dow)) {
      const t = sessions[i]!;
      out.push({ name: t.title, plannedFor: localDayKey(cursor), notes: t.notes, sets: expandSets(t.exercises) });
      i += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
