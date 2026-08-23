import type { Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Recovery Engine (Master Prompt P13). Turns sleep / HRV / resting-HR / stress
 * into a Recovery Score and a Training Readiness, both explainable. Pure — takes
 * health metrics in, returns provenance-aware results out.
 */

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/**
 * Window for the personal HRV/RHR baselines below. 60 days rather than the
 * training-load windows in scoring.ts (7d acute / 28d chronic, the standard
 * ACWR ratio — not touched here): a baseline is "what's normal for you", and
 * a longer window makes it both more stable (less swayed by a single rough
 * week) and, now that HealthKit import brings in real history instead of
 * only what's accumulated since the account was created, actually able to
 * use it from day one instead of needing a month of live use first.
 */
const BASELINE_DAYS = 60;

function within(m: HealthMetric, asOf: ISODateString, days: number): boolean {
  const age = (new Date(asOf).getTime() - new Date(m.measuredAt).getTime()) / DAY_MS;
  return age >= 0 && age < days;
}

/** Latest value of a metric type within `days`, or undefined. */
function latest(
  metrics: HealthMetric[],
  type: HealthMetric['type'],
  asOf: ISODateString,
  days = 2,
): number | undefined {
  const candidates = metrics
    .filter((m) => m.type === type && within(m, asOf, days))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  return candidates[0]?.value;
}

/** Mean of a metric type over a window (for personal baselines). */
function mean(
  metrics: HealthMetric[],
  type: HealthMetric['type'],
  asOf: ISODateString,
  days: number,
): number | undefined {
  const vals = metrics.filter((m) => m.type === type && within(m, asOf, days)).map((m) => m.value);
  if (vals.length === 0) return undefined;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export type RecoveryBand = 'excellent' | 'correct' | 'moyen' | 'faible';

/** Master Prompt P13.4 interpretation bands. */
export function recoveryBand(score: number): RecoveryBand {
  if (score >= 85) return 'excellent';
  if (score >= 60) return 'correct';
  if (score >= 40) return 'moyen';
  return 'faible';
}

/**
 * Recovery Score 0-100 from the components available. Sleep is weighted most,
 * then HRV vs baseline, resting HR vs baseline, and declared stress. Each
 * component contributes only when present; the score renormalizes and confidence
 * reflects how much data backed it.
 */
export function computeRecoveryScore(
  metrics: HealthMetric[],
  asOf: ISODateString,
): EngineResult<number> {
  const parts: { value: number; weight: number }[] = [];

  const sleepH = latest(metrics, 'sleep_duration', asOf);
  if (sleepH !== undefined) {
    // 8h ⇒ 100, linear down to 0 at 4h.
    parts.push({ value: clamp(((sleepH - 4) / 4) * 100), weight: 0.4 });
  }

  const hrv = latest(metrics, 'hrv', asOf);
  const hrvBase = mean(metrics, 'hrv', asOf, BASELINE_DAYS);
  if (hrv !== undefined && hrvBase) {
    // At/above baseline ⇒ 100; 30% below ⇒ ~40.
    parts.push({ value: clamp(50 + ((hrv - hrvBase) / hrvBase) * 150), weight: 0.3 });
  }

  const rhr = latest(metrics, 'resting_heart_rate', asOf);
  const rhrBase = mean(metrics, 'resting_heart_rate', asOf, BASELINE_DAYS);
  if (rhr !== undefined && rhrBase) {
    // Below baseline is good; elevated RHR lowers recovery.
    parts.push({ value: clamp(100 - ((rhr - rhrBase) / rhrBase) * 300), weight: 0.2 });
  }

  const stress = latest(metrics, 'stress', asOf);
  if (stress !== undefined) {
    parts.push({ value: clamp(100 - stress), weight: 0.1 });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const value =
    totalWeight > 0
      ? clamp(Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight))
      : 0;

  let confidence: Confidence = 'to_confirm';
  if (parts.length >= 3) confidence = 'high';
  else if (parts.length >= 1) confidence = 'medium';

  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

/**
 * Training Readiness (Master Prompt P13.11) — distinct from recovery: it answers
 * "can I do my planned session today?" by tempering recovery with recent load.
 */
export function computeTrainingReadiness(
  metrics: HealthMetric[],
  recentLoad: number,
  asOf: ISODateString,
): EngineResult<number> {
  const recovery = computeRecoveryScore(metrics, asOf).value;
  // High recent load slightly reduces readiness even when recovery is decent.
  const loadPenalty = Math.min(25, recentLoad / 20);
  const value = clamp(Math.round(recovery - loadPenalty));
  return {
    value,
    confidence: metrics.length >= 3 ? 'medium' : 'to_confirm',
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

/** Morning recovery briefing (Master Prompt P13.12), explainable. */
export function recoveryExplanation(
  metrics: HealthMetric[],
  asOf: ISODateString,
): Explanation | undefined {
  const score = computeRecoveryScore(metrics, asOf);
  if (score.confidence === 'to_confirm') return undefined;
  const band = recoveryBand(score.value);
  const actionKey: Record<RecoveryBand, string> = {
    excellent: 'engines.recovery.action.excellent',
    correct: 'engines.recovery.action.correct',
    moyen: 'engines.recovery.action.moyen',
    faible: 'engines.recovery.action.faible',
  };
  return {
    observation: { key: `engines.recovery.observation.${band}`, params: { score: score.value } },
    analysis: { key: 'engines.recovery.analysis' },
    action: { key: actionKey[band] },
  };
}
