import type { Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Sleep Engine (Master Prompt P14 sommeil). Turns imported sleep metrics
 * (duration + efficiency) into an explainable Sleep Score and a weekly trend.
 * Pure — health metrics in, provenance-aware results out. Complements the
 * Recovery Engine, which also reads sleep but blends it with HRV/RHR/stress.
 */

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Recommended nightly sleep, in hours (Master Prompt P14.4). */
export const SLEEP_TARGET_HOURS = 8;

function within(m: HealthMetric, asOf: ISODateString, days: number): boolean {
  const age = (new Date(asOf).getTime() - new Date(m.measuredAt).getTime()) / DAY_MS;
  return age >= 0 && age < days;
}

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

/** Score a single night's duration: 8h ⇒ 100, linear to 0 at 4h, capped. */
function durationScore(hours: number): number {
  return clamp(((hours - 4) / (SLEEP_TARGET_HOURS - 4)) * 100);
}

export type SleepBand = 'excellent' | 'correct' | 'moyen' | 'faible';

export function sleepBand(score: number): SleepBand {
  if (score >= 85) return 'excellent';
  if (score >= 60) return 'correct';
  if (score >= 40) return 'moyen';
  return 'faible';
}

/**
 * Sleep Score 0-100 from the most recent night. Duration is weighted most;
 * efficiency (time asleep vs in bed) refines it when available. Confidence
 * reflects how many components backed the score.
 */
export function computeSleepScore(
  metrics: HealthMetric[],
  asOf: ISODateString,
): EngineResult<number> {
  const parts: { value: number; weight: number }[] = [];

  const hours = latest(metrics, 'sleep_duration', asOf);
  if (hours !== undefined) parts.push({ value: durationScore(hours), weight: 0.65 });

  const efficiency = latest(metrics, 'sleep_efficiency', asOf);
  if (efficiency !== undefined) parts.push({ value: clamp(efficiency), weight: 0.35 });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const value =
    totalWeight > 0
      ? clamp(Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight))
      : 0;

  let confidence: Confidence = 'to_confirm';
  if (parts.length >= 2) confidence = 'high';
  else if (parts.length === 1) confidence = 'medium';

  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

export interface SleepNight {
  date: ISODateString;
  hours: number;
  score: number;
}

/** Per-night duration + score over the last `days`, most recent first. */
export function sleepTrend(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): SleepNight[] {
  return metrics
    .filter((m) => m.type === 'sleep_duration' && within(m, asOf, days))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .map((m) => ({ date: m.measuredAt, hours: m.value, score: Math.round(durationScore(m.value)) }));
}

/** Mean nightly hours over `days`, or undefined when no nights are logged. */
export function averageSleepHours(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): number | undefined {
  const nights = metrics.filter((m) => m.type === 'sleep_duration' && within(m, asOf, days));
  if (nights.length === 0) return undefined;
  return nights.reduce((s, m) => s + m.value, 0) / nights.length;
}

/** Explainable sleep briefing (Master Prompt P14.6), or undefined without data. */
export function sleepExplanation(
  metrics: HealthMetric[],
  asOf: ISODateString,
): Explanation | undefined {
  const score = computeSleepScore(metrics, asOf);
  if (score.confidence === 'to_confirm') return undefined;
  const hours = latest(metrics, 'sleep_duration', asOf);
  const band = sleepBand(score.value);
  const action: Record<SleepBand, string> = {
    excellent: 'Continue ainsi : ce rythme soutient bien ta récupération.',
    correct: 'Sommeil correct — vise la régularité des heures de coucher.',
    moyen: 'Essaie de te coucher 30 min plus tôt ce soir.',
    faible: 'Nuit courte : allège l’intensité et priorise le sommeil aujourd’hui.',
  };
  const h = hours !== undefined ? `${hours.toFixed(1)} h` : 'ta nuit';
  return {
    observation: `Ton score de sommeil est de ${score.value}/100 (${band}), pour ${h}.`,
    analysis: 'Calculé à partir de la durée et de l’efficacité de ta dernière nuit.',
    action: action[band],
  };
}
