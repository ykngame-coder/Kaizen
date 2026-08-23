import type { Activity, Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { Explanation, I18nText } from './result';
import { buildDailySnapshot, computeWorkload } from './scoring';

/**
 * Deterministic conversational coach (Master Prompt MVP P20.3 "IA v1", P6.3,
 * P25.10). It composes the scoring engines into explainable, translatable
 * replies — no black box (P1), no hardcoded language. Designed behind this
 * reply shape so a future LLM-backed coach can implement the same contract.
 *
 * `detectIntent` matches French keywords only — free-text questions typed in
 * another language fall back to 'help' for now (a known limitation; the
 * canned suggestion chips sidestep it entirely by carrying their `CoachIntent`
 * directly instead of round-tripping through translated text — see
 * `SUGGESTED_QUESTIONS` / `askCoachByIntent`).
 */

export type CoachIntent = 'today' | 'week' | 'fatigue' | 'plateau' | 'plan' | 'help';

export interface CoachReply {
  intent: CoachIntent;
  text: I18nText;
  explanation?: Explanation;
  confidence: Confidence;
  followUps: CoachIntent[];
}

export interface CoachContext {
  activities: Activity[];
  asOf: ISODateString;
  healthMetrics?: HealthMetric[];
}

const DAY_MS = 86_400_000;

function normalize(q: string): string {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const INTENT_KEYWORDS: Record<CoachIntent, string[]> = {
  today: ['aujourd', 'que faire', 'que dois', 'quoi faire', 'seance du jour', 'ma seance'],
  week: ['semaine', 'analyse', 'bilan', 'resume', 'mois', 'progression'],
  fatigue: ['fatigu', 'creve', 'epuise', 'repos', 'mal', 'douleur'],
  plateau: ['stagne', 'stagnation', 'progresse plus', 'plateau', 'bloque', 'pas de progres'],
  plan: ['programme', 'prepare', 'plan', 'entrainement pour', 'objectif'],
  help: [],
};

/** Best-effort intent classification from free-text (deterministic, French keywords). */
export function detectIntent(question: string): CoachIntent {
  const q = normalize(question);
  for (const intent of ['today', 'fatigue', 'plateau', 'plan', 'week'] as CoachIntent[]) {
    if (INTENT_KEYWORDS[intent].some((k) => q.includes(k))) return intent;
  }
  return 'help';
}

/** Translated label for a suggested question / follow-up chip. */
export const COACH_INTENT_LABEL: Record<CoachIntent, I18nText> = {
  today: { key: 'engines.coach.question.today' },
  week: { key: 'engines.coach.question.week' },
  fatigue: { key: 'engines.coach.question.fatigue' },
  plateau: { key: 'engines.coach.question.plateau' },
  plan: { key: 'engines.coach.question.plan' },
  help: { key: 'engines.coach.question.help' },
};

/** Suggested canonical questions (Master Prompt P6.2, P25.10) — tap sends the intent directly via askCoachByIntent, no text round-trip. */
export const SUGGESTED_QUESTIONS: CoachIntent[] = ['today', 'week', 'fatigue', 'plateau', 'plan'];

function activeDays(activities: Activity[], asOf: ISODateString, days: number): number {
  const set = new Set<string>();
  for (const a of activities) {
    const age = (new Date(asOf).getTime() - new Date(a.startedAt).getTime()) / DAY_MS;
    if (age >= 0 && age < days) set.add(a.startedAt.slice(0, 10));
  }
  return set.size;
}

function confidenceFromSample(count: number): Confidence {
  if (count >= 4) return 'high';
  if (count >= 1) return 'medium';
  return 'to_confirm';
}

function answerToday(ctx: CoachContext): CoachReply {
  const snap = buildDailySnapshot(ctx.activities, [], ctx.asOf, ctx.healthMetrics ?? []);
  return {
    intent: 'today',
    text: snap.value.recommendation.explanation.action,
    explanation: snap.value.recommendation.explanation,
    confidence: snap.value.recommendation.confidence,
    followUps: ['week', 'plan'],
  };
}

function answerWeek(ctx: CoachContext): CoachReply {
  const recent = ctx.activities.filter(
    (a) => (new Date(ctx.asOf).getTime() - new Date(a.startedAt).getTime()) / DAY_MS < 7,
  );
  const days = activeDays(ctx.activities, ctx.asOf, 7);
  const totalMin = Math.round(recent.reduce((s, a) => s + a.durationSec, 0) / 60);
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);

  const trendSlug = acwr > 1.5 ? 'up' : acwr < 0.8 ? 'down' : 'balanced';
  const text: I18nText =
    recent.length === 0
      ? { key: 'engines.coach.week.empty' }
      : {
          key: `engines.coach.week.summary.${trendSlug}`,
          params: { count: recent.length, days, totalMin },
        };

  return {
    intent: 'week',
    text,
    confidence: confidenceFromSample(recent.length),
    followUps: ['today', 'plateau'],
  };
}

function answerFatigue(ctx: CoachContext): CoachReply {
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);
  const explanation: Explanation = {
    observation: { key: 'engines.coach.fatigue.observation' },
    analysis: { key: acwr > 1.3 ? 'engines.coach.fatigue.analysis.highLoad' : 'engines.coach.fatigue.analysis.normal' },
    action: { key: 'engines.coach.fatigue.action' },
  };
  return {
    intent: 'fatigue',
    text: explanation.action,
    explanation,
    confidence: 'medium',
    followUps: ['week', 'today'],
  };
}

function answerPlateau(ctx: CoachContext): CoachReply {
  const days = activeDays(ctx.activities, ctx.asOf, 28);
  const explanation: Explanation =
    days < 8
      ? {
          observation: { key: 'engines.coach.plateau.lowActivity.observation', params: { days } },
          analysis: { key: 'engines.coach.plateau.lowActivity.analysis' },
          action: { key: 'engines.coach.plateau.lowActivity.action' },
        }
      : {
          observation: { key: 'engines.coach.plateau.stagnating.observation' },
          analysis: { key: 'engines.coach.plateau.stagnating.analysis' },
          action: { key: 'engines.coach.plateau.stagnating.action' },
        };
  return {
    intent: 'plateau',
    text: explanation.action,
    explanation,
    confidence: confidenceFromSample(ctx.activities.length),
    followUps: ['plan', 'week'],
  };
}

function answerPlan(ctx: CoachContext): CoachReply {
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);
  const focusSlug = acwr > 1.5 ? 'recovery' : acwr < 0.8 ? 'intense' : 'balanced';
  const explanation: Explanation = {
    observation: { key: 'engines.coach.plan.observation', params: { ratio: acwr.toFixed(1) } },
    analysis: { key: 'engines.coach.plan.analysis' },
    action: { key: `engines.coach.plan.action.${focusSlug}` },
  };
  return {
    intent: 'plan',
    text: explanation.action,
    explanation,
    confidence: confidenceFromSample(ctx.activities.length),
    followUps: ['today', 'fatigue'],
  };
}

function answerHelp(): CoachReply {
  return {
    intent: 'help',
    text: { key: 'engines.coach.help' },
    confidence: 'high',
    followUps: SUGGESTED_QUESTIONS.slice(0, 3),
  };
}

/** Answer one canned suggestion/follow-up directly by intent — no text round-trip, no language dependency. */
export function askCoachByIntent(intent: CoachIntent, ctx: CoachContext): CoachReply {
  switch (intent) {
    case 'today':
      return answerToday(ctx);
    case 'week':
      return answerWeek(ctx);
    case 'fatigue':
      return answerFatigue(ctx);
    case 'plateau':
      return answerPlateau(ctx);
    case 'plan':
      return answerPlan(ctx);
    default:
      return answerHelp();
  }
}

/** Answer a free-text question using the user's data. Pure and deterministic. */
export function askCoach(question: string, ctx: CoachContext): CoachReply {
  return askCoachByIntent(detectIntent(question), ctx);
}
