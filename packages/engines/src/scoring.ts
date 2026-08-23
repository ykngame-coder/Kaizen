import type {
  Activity,
  Confidence,
  Goal,
  HealthMetric,
  ISODateString,
  NutritionEntry,
  NutritionTargets,
  SleepSession,
} from '@supotsu/core';
import { OVERALL_SCORE_WEIGHTS, SPORT_SCORE_WEIGHTS } from '@supotsu/core';
import type { EngineResult, Explanation, Recommendation } from './result';
import { computeRecoveryScore, recoveryBand } from './recovery';
import { computeSleepScore2 } from './sleep';
import { computeNutritionScore, estimateTargets } from './nutrition';
import { trendSlopePerDay, type TrendPoint } from './progression';

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

const WEEK_MS = 7 * DAY_MS;
const CONFIDENCE_RANK: Record<Confidence, number> = { to_confirm: 0, medium: 1, high: 2 };

function minConfidence(confs: Confidence[]): Confidence {
  if (confs.length === 0) return 'to_confirm';
  return confs.reduce((min, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[min] ? c : min));
}

/** A day's worth of strength-training volume (reps × load), e.g. one session. */
export interface StrengthVolumePoint {
  date: ISODateString;
  volume: number;
}

/**
 * Bucket dated values into `weeks` consecutive 7-day windows ending at `asOf`,
 * oldest first, each spaced exactly 7 days apart (so trendSlopePerDay reads
 * "per week" cleanly via `slope * 7`). Weeks with no data are kept as 0 —
 * a real training gap is a real signal for the trend, not a missing point.
 */
function weeklySeries(
  items: { date: ISODateString; value: number }[],
  asOf: ISODateString,
  weeks: number,
): TrendPoint[] {
  const asOfMs = new Date(asOf).getTime();
  const buckets = new Array(weeks).fill(0) as number[];
  for (const it of items) {
    const age = asOfMs - new Date(it.date).getTime();
    if (age < 0 || age >= weeks * WEEK_MS) continue;
    const weeksAgo = Math.floor(age / WEEK_MS);
    const idx = weeks - 1 - weeksAgo;
    if (idx >= 0 && idx < weeks) buckets[idx] = buckets[idx]! + it.value;
  }
  return buckets.map((value, i) => ({
    date: new Date(asOfMs - (weeks - 1 - i) * WEEK_MS).toISOString(),
    value,
  }));
}

/** Week-over-week change as a fraction of the series' mean level, or undefined without a usable trend. */
function weeklyTrendPct(series: TrendPoint[]): number | undefined {
  const slope = trendSlopePerDay(series);
  if (slope === undefined) return undefined;
  const mean = series.reduce((s, p) => s + p.value, 0) / series.length;
  if (mean <= 0) return undefined;
  return (slope * 7) / mean;
}

/**
 * Progression score: is training load — and, when available, strength volume
 * (reps × charge) — trending up, flat, or down over the last `weeks` weeks?
 * 50 = flat; a rising trend pushes above 50, a falling one below.
 */
export function computeProgressionScore(
  activities: Activity[],
  asOf: ISODateString,
  strengthVolume: StrengthVolumePoint[] = [],
  weeks = 6,
): EngineResult<number> {
  const loadItems = activities
    .filter((a) => within(a, asOf, weeks * 7))
    .map((a) => ({ date: a.startedAt, value: activityLoad(a) }));
  const loadSeries = weeklySeries(loadItems, asOf, weeks);
  const loadWeeksWithData = loadSeries.filter((p) => p.value > 0).length;
  const loadPct = weeklyTrendPct(loadSeries);

  const volSeries =
    strengthVolume.length > 0
      ? weeklySeries(
          strengthVolume.map((s) => ({ date: s.date, value: s.volume })),
          asOf,
          weeks,
        )
      : undefined;
  const volWeeksWithData = volSeries ? volSeries.filter((p) => p.value > 0).length : 0;
  const volPct = volSeries ? weeklyTrendPct(volSeries) : undefined;

  const pcts = [loadPct, volPct].filter((p): p is number => p !== undefined);
  const weeksWithData = Math.max(loadWeeksWithData, volWeeksWithData);

  if (pcts.length === 0) {
    return { value: 50, confidence: 'to_confirm', sourcesUsed: ['supotsu'], generatedAt: asOf };
  }

  const avgPct = pcts.reduce((s, p) => s + p, 0) / pcts.length;
  const bounded = clamp(avgPct, -1, 1);
  const value = clamp(Math.round(50 + bounded * 50));
  const confidence: Confidence = weeksWithData >= 4 ? 'high' : weeksWithData >= 2 ? 'medium' : 'to_confirm';

  const pctRounded = Math.round(avgPct * 100);
  const explanation: Explanation = {
    observation:
      pctRounded >= 0
        ? { key: 'engines.scoring.trend.observation.up', params: { pct: pctRounded, weeks } }
        : { key: 'engines.scoring.trend.observation.down', params: { pct: Math.abs(pctRounded), weeks } },
    analysis: {
      key:
        pctRounded > 5
          ? 'engines.scoring.trend.analysis.up'
          : pctRounded < -5
            ? 'engines.scoring.trend.analysis.down'
            : 'engines.scoring.trend.analysis.stable',
    },
    action: {
      key:
        pctRounded > 5
          ? 'engines.scoring.trend.action.up'
          : pctRounded < -5
            ? 'engines.scoring.trend.action.down'
            : 'engines.scoring.trend.action.stable',
    },
  };

  return { value, confidence, explanation, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

export interface SportScoreBreakdown {
  performance: number;
  regularity: number;
  progression: number;
}

/**
 * Sport score: weighted average of Performance, Regularity (consistency) and
 * Progression, renormalized over whichever sub-scores actually have data.
 * ACWR/training-load is deliberately NOT included — it's a standalone metric
 * (Sport hub), not part of the score, to avoid double-counting training volume.
 */
export function computeSportScore(
  activities: Activity[],
  asOf: ISODateString,
  strengthVolume: StrengthVolumePoint[] = [],
): EngineResult<number> & { breakdown: SportScoreBreakdown } {
  const performance = computePerformanceScore(activities, asOf);
  const regularity = computeConsistencyScore(activities, asOf);
  const progression = computeProgressionScore(activities, asOf, strengthVolume);

  const breakdown: SportScoreBreakdown = {
    performance: performance.value,
    regularity: regularity.value,
    progression: progression.value,
  };

  const parts = [
    { result: performance, weight: SPORT_SCORE_WEIGHTS.performance, label: 'performance' as const },
    { result: regularity, weight: SPORT_SCORE_WEIGHTS.regularity, label: 'régularité' as const },
    { result: progression, weight: SPORT_SCORE_WEIGHTS.progression, label: 'progression' as const },
  ];
  const available = parts.filter((p) => p.result.confidence !== 'to_confirm');

  if (available.length === 0) {
    return {
      value: 50,
      confidence: 'to_confirm',
      breakdown,
      sourcesUsed: ['supotsu'],
      generatedAt: asOf,
    };
  }

  const totalWeight = available.reduce((s, p) => s + p.weight, 0);
  const value = clamp(
    Math.round(available.reduce((s, p) => s + p.result.value * p.weight, 0) / totalWeight),
  );
  const confidence = minConfidence(available.map((p) => p.result.confidence));

  const weakest = [...available].sort((a, b) => a.result.value - b.result.value)[0]!;
  const weakestSlug = weakest.label === 'progression' ? 'progression' : weakest.label === 'régularité' ? 'regularity' : 'performance';
  const explanation: Explanation = {
    observation: {
      key: 'engines.scoring.sport.observation',
      params: { value, performance: breakdown.performance, regularity: breakdown.regularity, progression: breakdown.progression },
    },
    analysis:
      weakest.result.value < 50
        ? { key: `engines.scoring.sport.analysis.weak.${weakestSlug}`, params: { value: weakest.result.value } }
        : { key: 'engines.scoring.sport.analysis.balanced' },
    action: {
      key:
        weakest.result.value < 50 ? `engines.scoring.sport.action.weak.${weakestSlug}` : 'engines.scoring.sport.action.balanced',
    },
  };

  return { value, confidence, breakdown, explanation, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

export interface DailySnapshot {
  overall: number;
  /** Sport pillar (performance + regularity + progression), null without enough activity data. */
  sport: number | null;
  sportBreakdown: SportScoreBreakdown | null;
  /** 0-100, or null when no health data is available yet. */
  recovery: number | null;
  /** Sommeil (Score 2.0 — quantité/qualité/régularité/dette/récup), null without a logged night. */
  sleep: number | null;
  /** Null without any nutrition entry logged today. */
  nutrition: number | null;
  /** Legacy sub-scores, still used for the recommendation and displayed as standalone metrics. */
  performance: number;
  consistency: number;
  trainingLoad: number;
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
      observation: { key: 'engines.scoring.daily.lowRecovery.observation', params: { recovery } },
      analysis: { key: 'engines.scoring.daily.lowRecovery.analysis' },
      action: { key: 'engines.scoring.daily.lowRecovery.action' },
    };
    return { pillar: 'recovery', title: explanation.action, explanation, confidence: 'high' };
  }

  if (days === 0) {
    explanation = {
      observation: { key: 'engines.scoring.daily.noActivity.observation' },
      analysis: { key: 'engines.scoring.daily.noActivity.analysis' },
      action: { key: 'engines.scoring.daily.noActivity.action' },
    };
  } else if (workload.acwr > 1.5) {
    explanation = {
      observation: { key: 'engines.scoring.daily.highLoad.observation' },
      analysis: { key: 'engines.scoring.daily.highLoad.analysis' },
      action: { key: 'engines.scoring.daily.highLoad.action' },
    };
    confidence = 'high';
  } else if (workload.acwr < 0.8 && days >= 3) {
    explanation = {
      observation: { key: 'engines.scoring.daily.roomToPush.observation' },
      analysis: { key: 'engines.scoring.daily.roomToPush.analysis' },
      action: { key: 'engines.scoring.daily.roomToPush.action' },
    };
  } else {
    explanation = {
      observation: { key: 'engines.scoring.daily.balanced.observation', params: { days } },
      analysis: { key: 'engines.scoring.daily.balanced.analysis' },
      action: { key: 'engines.scoring.daily.balanced.action' },
    };
    confidence = consistency >= 60 ? 'high' : 'medium';
  }

  return { pillar: 'decision', title: explanation.action, explanation, confidence };
}

/** Optional inputs for the pillars beyond activities/health (all default to "no data"). */
export interface DailySnapshotExtras {
  nutritionEntries?: NutritionEntry[];
  nutritionTargets?: NutritionTargets;
  sleepSessions?: SleepSession[];
  strengthVolume?: StrengthVolumePoint[];
}

/**
 * Aggregates the four pillars (Sport, Récupération, Sommeil, Nutrition) into
 * the dashboard snapshot. Each pillar is null when its own confidence is
 * `to_confirm` (no usable data yet), and the overall score re-normalizes
 * over whichever pillars actually have data — never inflating a score for a
 * missing one (P1 "aucune boîte noire").
 */
export function buildDailySnapshot(
  activities: Activity[],
  _goals: Goal[],
  asOf: ISODateString,
  healthMetrics: HealthMetric[] = [],
  extras: DailySnapshotExtras = {},
): EngineResult<DailySnapshot> {
  const performance = computePerformanceScore(activities, asOf).value;
  const consistency = computeConsistencyScore(activities, asOf).value;
  const trainingLoad = computeTrainingLoadScore(activities, asOf).value;
  const workload = computeWorkload(activities, asOf);

  const recoveryResult = computeRecoveryScore(healthMetrics, asOf);
  const hasRecovery = recoveryResult.confidence !== 'to_confirm';
  const recovery = hasRecovery ? recoveryResult.value : null;

  const sportResult = computeSportScore(activities, asOf, extras.strengthVolume ?? []);
  const hasSport = sportResult.confidence !== 'to_confirm';
  const sport = hasSport ? sportResult.value : null;
  const sportBreakdown = hasSport ? sportResult.breakdown : null;

  const sleepResult = computeSleepScore2(healthMetrics, asOf, 7, extras.sleepSessions);
  const hasSleep = sleepResult.confidence !== 'to_confirm';
  const sleep = hasSleep ? sleepResult.value : null;

  const nutritionTargets = extras.nutritionTargets ?? estimateTargets({}, asOf).value;
  const nutritionResult = computeNutritionScore(extras.nutritionEntries ?? [], nutritionTargets, asOf);
  const hasNutrition = nutritionResult.confidence !== 'to_confirm';
  const nutrition = hasNutrition ? nutritionResult.value : null;

  // Weighted overall over the pillars actually available (renormalized).
  const pillars: { value: number; weight: number }[] = [];
  if (sport !== null) pillars.push({ value: sport, weight: OVERALL_SCORE_WEIGHTS.sport });
  if (recovery !== null) pillars.push({ value: recovery, weight: OVERALL_SCORE_WEIGHTS.recovery });
  if (sleep !== null) pillars.push({ value: sleep, weight: OVERALL_SCORE_WEIGHTS.sleep });
  if (nutrition !== null) pillars.push({ value: nutrition, weight: OVERALL_SCORE_WEIGHTS.nutrition });
  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
  const overall =
    totalWeight > 0
      ? clamp(Math.round(pillars.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight))
      : 0;

  const recommendation = buildRecommendation(activities, asOf, workload, consistency, recovery);
  const sample = activities.filter((a) => within(a, asOf, 28)).length;

  return {
    value: {
      overall,
      sport,
      sportBreakdown,
      recovery,
      sleep,
      nutrition,
      performance,
      consistency,
      trainingLoad,
      acwr: workload.acwr,
      recommendation,
    },
    confidence: pillars.length > 0 || sample >= 4 ? 'medium' : 'to_confirm',
    explanation: recommendation.explanation,
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}
