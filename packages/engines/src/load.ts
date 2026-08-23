import type { Activity, Confidence, Intensity, ISODateString } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Training-Load Engine (Master Prompt P13/P34 — charge & prévention). Turns
 * activities into a session load, a daily-load series, and the acute:chronic
 * workload ratio (ACWR) with injury-risk zones. Pure and explainable — the
 * "sweet spot" is made visible, not hidden.
 */

const DAY_MS = 86_400_000;

/** Session-load intensity multiplier (session-RPE style). */
const INTENSITY_FACTOR: Record<Intensity, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  max: 4,
};

/** Load of one session ≈ minutes × intensity (defaults to moderate). */
export function sessionLoad(activity: Activity): number {
  const minutes = activity.durationSec / 60;
  return minutes * INTENSITY_FACTOR[activity.intensity ?? 'moderate'];
}

/** Daily total load over the last `days` (index 0 = oldest, days-1 = today). */
export function dailyLoadSeries(
  activities: Activity[],
  asOf: ISODateString,
  days: number,
): number[] {
  const now = new Date(asOf).getTime();
  const out = new Array<number>(days).fill(0);
  for (const a of activities) {
    const age = Math.floor((now - new Date(a.startedAt).getTime()) / DAY_MS);
    const i = days - 1 - age;
    if (i >= 0 && i < days) out[i]! += sessionLoad(a);
  }
  return out;
}

export type LoadZone = 'sous-charge' | 'optimal' | 'élevé' | 'risque';

/** ACWR interpretation bands (classic 0.8–1.3 "sweet spot"). */
export function acwrZone(ratio: number): LoadZone {
  if (ratio < 0.8) return 'sous-charge';
  if (ratio <= 1.3) return 'optimal';
  if (ratio <= 1.5) return 'élevé';
  return 'risque';
}

export interface AcwrResult {
  /** Sum of load over the last 7 days. */
  acute: number;
  /** Average weekly load over the last 28 days. */
  chronic: number;
  /** acute / chronic, or null when there is no chronic baseline yet. */
  ratio: number | null;
  zone: LoadZone | null;
  confidence: Confidence;
}

/**
 * Acute:Chronic Workload Ratio. Acute = last 7 days of load; chronic = the
 * average of the four weeks in the last 28 days. Ratio near 1 means training is
 * in step with recent fitness; spikes raise injury risk.
 */
export function computeAcwr(activities: Activity[], asOf: ISODateString): AcwrResult {
  const daily = dailyLoadSeries(activities, asOf, 28);
  const acute = daily.slice(21).reduce((s, v) => s + v, 0);
  const chronic = daily.reduce((s, v) => s + v, 0) / 4;
  const ratio = chronic > 0 ? acute / chronic : null;
  const activeDays = daily.filter((v) => v > 0).length;
  let confidence: Confidence = 'to_confirm';
  if (activeDays >= 8) confidence = 'high';
  else if (activeDays >= 3) confidence = 'medium';
  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio,
    zone: ratio !== null ? acwrZone(ratio) : null,
    confidence,
  };
}

/** ACWR as an EngineResult (for the Decision Engine / dashboard). */
export function acuteChronicRatio(
  activities: Activity[],
  asOf: ISODateString,
): EngineResult<number> {
  const res = computeAcwr(activities, asOf);
  return {
    value: res.ratio ?? 0,
    confidence: res.confidence,
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

/** Explainable load briefing, or undefined without a chronic baseline. */
export function loadExplanation(
  activities: Activity[],
  asOf: ISODateString,
): Explanation | undefined {
  const res = computeAcwr(activities, asOf);
  if (res.ratio === null || res.confidence === 'to_confirm') return undefined;
  const zone = res.zone!;
  const zoneSlug: Record<LoadZone, string> = {
    'sous-charge': 'underLoad',
    optimal: 'optimal',
    'élevé': 'high',
    risque: 'risk',
  };
  const slug = zoneSlug[zone];
  return {
    observation: { key: `engines.load.observation.${slug}`, params: { ratio: res.ratio.toFixed(2) } },
    analysis: { key: 'engines.load.analysis' },
    action: { key: `engines.load.action.${slug}` },
  };
}
