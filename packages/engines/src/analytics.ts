import type { ISODateString } from '@supotsu/core';
import type { TrendPoint } from './progression';

/**
 * Analytics Engine (Master Prompt P34 progression, P18 compréhension). Pure,
 * cross-pillar helpers: bucket series by day over a window, and correlate two
 * aligned daily series with an explainable strength — so insights like
 * "sleep ↔ perceived energy" are grounded, never black-box.
 */

const DAY_MS = 86_400_000;

export interface AnalyticsPeriod {
  key: '7j' | '4sem' | '1an';
  label: string;
  days: number;
}

export const ANALYTICS_PERIODS: AnalyticsPeriod[] = [
  { key: '7j', label: '7 jours', days: 7 },
  { key: '4sem', label: '4 semaines', days: 28 },
  { key: '1an', label: '1 an', days: 365 },
];

function dayIndex(iso: ISODateString, asOf: ISODateString, days: number): number {
  const age = Math.floor((new Date(asOf).getTime() - new Date(iso).getTime()) / DAY_MS);
  // 0 = oldest day in the window … days-1 = today.
  return days - 1 - age;
}

/**
 * Daily means over the last `days` (index 0 = oldest, days-1 = today). Buckets
 * with no data are null so alignment and gaps stay explicit.
 */
export function dailyMeans(
  points: TrendPoint[],
  asOf: ISODateString,
  days: number,
): (number | null)[] {
  const sums = new Array<number>(days).fill(0);
  const counts = new Array<number>(days).fill(0);
  for (const p of points) {
    const i = dayIndex(p.date, asOf, days);
    if (i >= 0 && i < days) {
      sums[i]! += p.value;
      counts[i]! += 1;
    }
  }
  return sums.map((s, i) => (counts[i]! > 0 ? s / counts[i]! : null));
}

/** Daily sums over the last `days` (e.g. training minutes per day). */
export function dailySums(
  points: TrendPoint[],
  asOf: ISODateString,
  days: number,
): number[] {
  const sums = new Array<number>(days).fill(0);
  for (const p of points) {
    const i = dayIndex(p.date, asOf, days);
    if (i >= 0 && i < days) sums[i]! += p.value;
  }
  return sums;
}

/** Pearson correlation over paired values, or undefined with < 3 pairs. */
export function pearson(pairs: [number, number][]): number | undefined {
  const n = pairs.length;
  if (n < 3) return undefined;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return undefined;
  return cov / Math.sqrt(vx * vy);
}

/** Pair up two daily series on days where both have a value. */
export function alignedPairs(
  a: (number | null)[],
  b: (number | null)[],
): [number, number][] {
  const pairs: [number, number][] = [];
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x !== null && x !== undefined && y !== null && y !== undefined) pairs.push([x, y]);
  }
  return pairs;
}

export type CorrelationStrength = 'forte' | 'modérée' | 'faible' | 'négligeable';

export function correlationStrength(r: number): CorrelationStrength {
  const abs = Math.abs(r);
  if (abs >= 0.6) return 'forte';
  if (abs >= 0.4) return 'modérée';
  if (abs >= 0.2) return 'faible';
  return 'négligeable';
}

export interface CorrelationInsight {
  r: number;
  strength: CorrelationStrength;
  direction: 'positive' | 'négative';
  pairs: number;
}

/** Correlate two daily series; undefined when too few overlapping days. */
export function correlate(
  a: (number | null)[],
  b: (number | null)[],
): CorrelationInsight | undefined {
  const r = pearson(alignedPairs(a, b));
  if (r === undefined) return undefined;
  return {
    r,
    strength: correlationStrength(r),
    direction: r >= 0 ? 'positive' : 'négative',
    pairs: alignedPairs(a, b).length,
  };
}
