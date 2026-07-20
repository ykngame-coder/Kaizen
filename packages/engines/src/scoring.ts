import type { Activity, Confidence, Goal, HealthMetric, ISODateString } from '@supotsu/core';
import { OVERALL_SCORE_WEIGHTS } from '@supotsu/core';
import type { EngineResult, Explanation, Recommendation } from './result';
import { computeRecoveryScore, recoveryBand } from './recovery';

/**
 * Pure scoring functions. They take domain data in and return provenance-aware
 * results out — no persistence, no UI (Master Prompt P2). The Decision layer of
 * the app composes these into the daily snapshot.
 */

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

const INTENSITY_WEIGHT: Record<string, number> = { low: 1, moderate: 2, high: 3, max: 4 };

/** Relative training load of one activity: minutes × intensity factor. */
export function activityLoad(activity: Activity): number {
  const minutes = activity.durationSec / 60;
  const weight = INTENSITY_WEIGHT[activity.intensity ?? 'moderate'] ?? 2;
  return minutes * weight;
}

function daysBetween(from: ISODateString, to: ISODateString): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
}

function within(activity: Activity, asOf: ISODateString, days: number): boolean {
  const age = daysBetween(activity.startedAt, asOf);
  return age >= 0 && age < days;
}

/** Distinct calendar days with at least one activity in the last `days`. */
function activeDays(activities: Activity[], asOf: ISODateString, days: number): number {
  const set = new Set<string>();
  for (const a of activities) {
    if (within(a, asOf, days)) set.add(a.startedAt.slice(0, 10));
  }
  return set.size;
}

function confidenceFromSample(count: number): Confidence {
  if (count >= 4) return 'high';
  if (count >= 1) return 'medium';
  return 'to_confirm';
}

/** Consistency = active days over the last 7 (5+ days ⇒ 100). */
export function computeConsistencyScore(
  activities: Activity[],
  asOf: ISODateString,
): EngineResult<number> {
  const days = activeDays(activities, asOf, 7);
  const value = clamp(Math.round((days / 5) * 100));
  return {
    value,
    confidence: confidenceFromSample(activities.filter((a) => within(a, asOf, 28)).length),
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

export interface WorkloadResult {
  acuteWeekly: number;
  chronicWeekly: number;
  /** Acute:chronic workload ratio (≈1 balanced, >1.5 spike, <0.8 detraining). */
  acwr: number;
}

/** Acute (7d) vs chronic (28d → weekly avg) workload (Master Prompt P10.6/P34.10). */
export function computeWorkload(activities: Activity[], asOf: ISODateString): WorkloadResult {
  const acute = activities
    .filter((a) => within(a, asOf, 7))
    .reduce((sum, a) => sum + activityLoad(a), 0);
  const chronic28 = activities
    .filter((a) => within(a, asOf, 28))
    .reduce((sum, a) => sum + activityLoad(a), 0);
  const chronicWeekly = chronic28 / 4;
  const acwr = chronicWeekly > 0 ? acute / chronicWeekly : acute > 0 ? 2 : 0;
  return { acuteWeekly: acute, chronicWeekly, acwr };
}

/** Training-load score: 100 when acute load matches the sweet-spot band. */
export function computeTrainingLoadScore(
  activities: Activity[],
  asOf: ISODateString,
): EngineResult<number> {
  const { acwr } = computeWorkload(activities, asOf);
  // Peak score around acwr 1.0; penalize spikes and detraining.
  const value = clamp(Math.round(100 - Math.abs(acwr - 1) * 60));
  return {
    value,
    confidence: confidenceFromSample(activities.filter((a) => within(a, asOf, 28)).length),
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

/** Performance proxy: this week's load vs the previous week (trend). */
export function computePerformanceScore(
  activities: Activity[],
  asOf: ISODateString,
): EngineResult<number> {
  const thisWeek = activities
    .filter((a) => within(a, asOf, 7))
    .reduce((s, a) => s + activityLoad(a), 0);
  const prevWeek = activities
    .filter((a) => {
      const age = daysBetween(a.startedAt, asOf);
      return age >= 7 && age < 14;
    })
    .reduce((s, a) => s + activityLoad(a), 0);
  // No activity at all in the two-week window → no basis for a trend.
  if (thisWeek === 0 && prevWeek === 0) {
    return { value: 0, confidence: 'to_confirm', sourcesUsed: ['supotsu'], generatedAt: asOf };
  }
  const delta = prevWeek > 0 ? (thisWeek - prevWeek) / prevWeek : thisWeek > 0 ? 0.2 : 0;
  const value = clamp(Math.round(50 + delta * 50));
  return {
    value,
    confidence: confidenceFromSample(activities.filter((a) => within(a, asOf, 14)).length),
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

export interface DailySnapshot {
  overall: number;
  performance: number;
  consistency: number;
  trainingLoad: number;
  /** 0-100, or null when no health data is available yet. */
  recovery: number | null;
  acwr: number;
  recommendation: Recommendation;
}

/** Recommendation derived from recovery + workload + consistency (explainable, P18.9). */
function buildRecommendation(
  activities: Activity[],
  asOf: ISODateString,
  workload: WorkloadResult,
  consistency: number,
  recovery: number | null,
): Recommendation {
  const days = activeDays(activities, asOf, 7);
  let explanation: Explanation;
  let confidence: Confidence = 'medium';

  // Low recovery takes priority — health before performance (Master Prompt P1).
  if (recovery !== null && recoveryBand(recovery) === 'faible') {
    explanation = {
      observation: `Ta récupération est faible (${recovery}/100).`,
      analysis: 'S’entraîner dur sur une récupération basse freine la progression.',
      action: 'Priorité aujourd’hui : repos ou mobilité légère.',
    };
    return { pillar: 'recovery', title: explanation.action, explanation, confidence: 'high' };
  }

  if (days === 0) {
    explanation = {
      observation: 'Aucune activité enregistrée ces 7 derniers jours.',
      analysis: 'Ta régularité est en baisse, le plus dur est de reprendre.',
      action: 'Planifie une séance légère aujourd’hui pour relancer la dynamique.',
    };
  } else if (workload.acwr > 1.5) {
    explanation = {
      observation: 'Ta charge récente est nettement supérieure à ton habitude.',
      analysis: 'Une hausse trop rapide augmente le risque de fatigue et de blessure.',
      action: 'Privilégie aujourd’hui la récupération active ou la mobilité.',
    };
    confidence = 'high';
  } else if (workload.acwr < 0.8 && days >= 3) {
    explanation = {
      observation: 'Ta charge est en baisse alors que ta régularité est bonne.',
      analysis: 'Ton corps a de la marge pour encaisser davantage.',
      action: 'Tu peux prévoir une séance un peu plus intense.',
    };
  } else {
    explanation = {
      observation: `Tu es actif ${days} jour(s) sur les 7 derniers.`,
      analysis: 'Ta charge et ta régularité sont équilibrées.',
      action: 'Continue sur ce rythme, la progression est durable.',
    };
    confidence = consistency >= 60 ? 'high' : 'medium';
  }

  return { pillar: 'decision', title: explanation.action, explanation, confidence };
}

/**
 * Aggregates sub-scores into the dashboard snapshot. Recovery is absent until
 * connectors land (Étape 5), so the overall score re-normalizes over the
 * components we actually have — and its confidence reflects that.
 */
export function buildDailySnapshot(
  activities: Activity[],
  _goals: Goal[],
  asOf: ISODateString,
  healthMetrics: HealthMetric[] = [],
): EngineResult<DailySnapshot> {
  const performance = computePerformanceScore(activities, asOf).value;
  const consistency = computeConsistencyScore(activities, asOf).value;
  const trainingLoad = computeTrainingLoadScore(activities, asOf).value;
  const workload = computeWorkload(activities, asOf);

  const recoveryResult = computeRecoveryScore(healthMetrics, asOf);
  const hasRecovery = recoveryResult.confidence !== 'to_confirm';
  const recovery = hasRecovery ? recoveryResult.value : null;

  // Weighted overall over the components actually available (renormalized).
  const parts: { value: number; weight: number }[] = [
    { value: performance, weight: OVERALL_SCORE_WEIGHTS.performance },
    { value: consistency, weight: OVERALL_SCORE_WEIGHTS.consistency },
  ];
  if (recovery !== null) parts.push({ value: recovery, weight: OVERALL_SCORE_WEIGHTS.recovery });
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const overall = clamp(
    Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight),
  );

  const recommendation = buildRecommendation(activities, asOf, workload, consistency, recovery);
  const sample = activities.filter((a) => within(a, asOf, 28)).length;

  return {
    value: {
      overall,
      performance,
      consistency,
      trainingLoad,
      recovery,
      acwr: workload.acwr,
      recommendation,
    },
    confidence: hasRecovery || sample >= 4 ? 'medium' : 'to_confirm',
    explanation: recommendation.explanation,
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}
