import type { Goal, HealthMetric, ISODateString } from '@supotsu/core';

/**
 * Progression Engine (Master Prompt P3 module Objectifs, P34 progression). Pure
 * helpers that turn already-collected data into progression views: goal
 * completion, trend summaries, and a linear projection toward a target. No UI,
 * no storage — series in, insights out.
 */

const DAY_MS = 86_400_000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface TrendPoint {
  date: ISODateString;
  value: number;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendSummary {
  /** Points sorted oldest → newest. */
  points: TrendPoint[];
  first: number;
  last: number;
  min: number;
  max: number;
  changeAbs: number;
  changePct: number;
  direction: TrendDirection;
}

/** Summarise a numeric time series (change, direction, bounds). */
export function summarizeTrend(points: TrendPoint[]): TrendSummary | undefined {
  if (points.length === 0) return undefined;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((p) => p.value);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const changeAbs = last - first;
  const changePct = first !== 0 ? (changeAbs / Math.abs(first)) * 100 : 0;
  const eps = Math.abs(first) * 0.01;
  const direction: TrendDirection = changeAbs > eps ? 'up' : changeAbs < -eps ? 'down' : 'flat';
  return {
    points: sorted,
    first,
    last,
    min: Math.min(...values),
    max: Math.max(...values),
    changeAbs,
    changePct,
    direction,
  };
}

/** Weight series from health metrics over the last `days`, oldest → newest. */
export function weightTrend(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 90,
): TrendPoint[] {
  const now = new Date(asOf).getTime();
  return metrics
    .filter((m) => m.type === 'weight' && (now - new Date(m.measuredAt).getTime()) / DAY_MS < days)
    .map((m) => ({ date: m.measuredAt, value: m.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Daily steps series from health metrics over the last `days`, oldest →
 * newest — one point per calendar day (the max reading that day, since a
 * device can sync several cumulative totals across the day; never summed).
 */
export function stepsTrend(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 90,
): TrendPoint[] {
  const now = new Date(asOf).getTime();
  const byDay = new Map<string, number>();
  for (const m of metrics) {
    if (m.type !== 'steps' || (now - new Date(m.measuredAt).getTime()) / DAY_MS >= days) continue;
    const key = m.measuredAt.slice(0, 10);
    byDay.set(key, Math.max(byDay.get(key) ?? 0, m.value));
  }
  return [...byDay.entries()]
    .map(([date, value]) => ({ date: `${date}T12:00:00.000Z`, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Goal progress 0-1. Uses current vs target relative to a start when both are
 * known (so "lose 5 kg" reads correctly); otherwise falls back to the stored
 * progress. `startValue` defaults to the target's opposite side of current.
 */
export function computeGoalProgress(goal: Goal, startValue?: number): number {
  if (goal.targetValue === undefined || goal.currentValue === undefined) {
    return clamp01(goal.progress);
  }
  const start = startValue ?? goal.currentValue;
  const span = goal.targetValue - start;
  if (span === 0) return goal.currentValue === goal.targetValue ? 1 : clamp01(goal.progress);
  return clamp01((goal.currentValue - start) / span);
}

/** Least-squares slope (value units per day) of a series, or undefined. */
export function trendSlopePerDay(points: TrendPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  const t0 = new Date(points[0]!.date).getTime();
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / DAY_MS);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  return den === 0 ? undefined : num / den;
}

/**
 * Linear projection of the date a `target` is reached, from a series' recent
 * rate. Returns undefined when the trend is flat or heading away from target.
 */
export function projectTargetDate(
  points: TrendPoint[],
  target: number,
  asOf: ISODateString,
): ISODateString | undefined {
  const summary = summarizeTrend(points);
  const slope = trendSlopePerDay(points);
  if (!summary || slope === undefined || slope === 0) return undefined;
  const remaining = target - summary.last;
  // Heading the wrong way (e.g. gaining weight while target is lower).
  if (Math.sign(remaining) !== Math.sign(slope)) return undefined;
  const days = remaining / slope;
  if (days <= 0 || days > 3650) return undefined;
  return new Date(new Date(asOf).getTime() + days * DAY_MS).toISOString();
}
