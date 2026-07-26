import { describe, expect, it } from 'vitest';
import type { HealthMetric } from '@supotsu/core';
import { predictNextDayEnergy } from './prediction';

const ASOF = '2026-07-20T09:00:00.000Z';
const DAY = 86_400_000;
const ago = (n: number): string => new Date(new Date(ASOF).getTime() - n * DAY).toISOString();

function metric(type: HealthMetric['type'], value: number, n: number): HealthMetric {
  const at = ago(n);
  return {
    id: `${type}-${n}`,
    userId: 'u1',
    type,
    value,
    unit: 'x',
    source: 'garmin',
    measuredAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

/** Nights of a given duration for the last `count` days. */
function nights(hours: number, count: number): HealthMetric[] {
  return Array.from({ length: count }, (_, i) => metric('sleep_duration', hours, i));
}

describe('predictNextDayEnergy', () => {
  it('is to_confirm without enough data to anchor recovery', () => {
    const r = predictNextDayEnergy([], ASOF);
    expect(r.confidence).toBe('to_confirm');
    expect(r.value).toBeNull();
  });

  it('caps confidence at medium (a forecast is never certain)', () => {
    const metrics = [...nights(8, 5), metric('stress', 20, 0), metric('hrv', 65, 0)];
    const r = predictNextDayEnergy(metrics, ASOF);
    expect(r.confidence).toBe('medium');
    expect(r.value).not.toBeNull();
    expect(r.value!.energyScore).toBeGreaterThan(0);
    expect(r.value!.energyScore).toBeLessThanOrEqual(100);
    expect(r.value!.drivers.length).toBeGreaterThan(0);
  });

  it('predicts lower energy and flags sleep debt on short nights', () => {
    const good = predictNextDayEnergy([...nights(8, 5), metric('stress', 20, 0)], ASOF);
    const poor = predictNextDayEnergy([...nights(5, 5), metric('stress', 20, 0)], ASOF);
    expect(poor.value!.energyScore).toBeLessThan(good.value!.energyScore);
    expect(poor.value!.drivers.some((d) => d.includes('dette'))).toBe(true);
  });

  it('raises fatigue risk and names load when ACWR is high', () => {
    const base = [...nights(8, 5), metric('stress', 20, 0)];
    const calm = predictNextDayEnergy(base, ASOF, { acwr: 1.0 });
    const spiked = predictNextDayEnergy(base, ASOF, { acwr: 1.7 });
    expect(spiked.value!.drivers.some((d) => d.includes('charge'))).toBe(true);
    expect(spiked.value!.energyScore).toBeLessThanOrEqual(calm.value!.energyScore);
  });
});
