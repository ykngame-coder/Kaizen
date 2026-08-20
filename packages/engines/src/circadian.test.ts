import { describe, expect, it } from 'vitest';
import type { HealthMetric } from '@supotsu/core';
import { computeCircadianProfile } from './circadian';

const ASOF = '2026-07-27T12:00:00.000Z'; // a Monday noon UTC

/** A sleep night: value = hours, measuredAt = bedtime (UTC). */
function night(hours: number, bedtimeIso: string): HealthMetric {
  return {
    id: `n-${bedtimeIso}`,
    userId: 'u1',
    type: 'sleep_duration',
    value: hours,
    unit: 'h',
    source: 'garmin',
    measuredAt: bedtimeIso,
    createdAt: bedtimeIso,
    updatedAt: bedtimeIso,
  };
}

describe('computeCircadianProfile', () => {
  it('is to_confirm below the minimum number of nights', () => {
    const r = computeCircadianProfile([night(8, '2026-07-26T22:00:00.000Z')], ASOF);
    expect(r.confidence).toBe('to_confirm');
    expect(r.value).toBeNull();
  });

  it('derives habitual and ideal times in UTC when no offset is given', () => {
    // Seven nights, bedtime 22:00 UTC, 8h ⇒ wake 06:00 UTC.
    const metrics = Array.from({ length: 7 }, (_, i) =>
      night(8, `2026-07-${20 + i}T22:00:00.000Z`),
    );
    const r = computeCircadianProfile(metrics, ASOF);
    expect(r.confidence).toBe('high');
    expect(r.value?.habitualBedtime).toBe('22:00');
    expect(r.value?.habitualWake).toBe('06:00');
    // 8h target kept against the habitual wake ⇒ ideal bedtime 22:00.
    expect(r.value?.idealBedtime).toBe('22:00');
    expect(r.value?.recommendations).toHaveLength(4);
  });

  it('applies the timezone offset to local times', () => {
    // Bedtime 20:00 UTC + 120 min ⇒ 22:00 local.
    const metrics = Array.from({ length: 5 }, (_, i) =>
      night(8, `2026-07-${20 + i}T20:00:00.000Z`),
    );
    const r = computeCircadianProfile(metrics, ASOF, { tzOffsetMinutes: 120 });
    expect(r.value?.habitualBedtime).toBe('22:00');
    expect(r.value?.habitualWake).toBe('06:00');
  });

  it('classifies an early chronotype and a late one', () => {
    const early = Array.from({ length: 7 }, (_, i) =>
      night(8, `2026-07-${20 + i}T21:00:00.000Z`), // mid-sleep 01:00 ⇒ précoce
    );
    const late = Array.from({ length: 7 }, (_, i) =>
      night(8, `2026-07-${20 + i}T01:00:00.000Z`), // bed 01:00, mid-sleep 05:00 ⇒ tardif
    );
    expect(computeCircadianProfile(early, ASOF).value?.chronotype).toBe('précoce');
    expect(computeCircadianProfile(late, ASOF).value?.chronotype).toBe('tardif');
  });

  it('computes social jetlag from weekday vs weekend nights', () => {
    // 2026-07-20 is a Monday. Fri=07-24, Sat=07-25 are weekend (free-day) nights.
    const metrics: HealthMetric[] = [
      night(8, '2026-07-20T22:00:00.000Z'), // Mon
      night(8, '2026-07-21T22:00:00.000Z'), // Tue
      night(8, '2026-07-22T22:00:00.000Z'), // Wed
      night(8, '2026-07-23T22:00:00.000Z'), // Thu
      night(8, '2026-07-24T23:30:00.000Z'), // Fri (weekend) — later
      night(8, '2026-07-25T23:30:00.000Z'), // Sat (weekend) — later
    ];
    const r = computeCircadianProfile(metrics, ASOF);
    expect(r.value?.socialJetlagMin).toBeGreaterThanOrEqual(85);
    expect(r.value?.socialJetlagMin).toBeLessThanOrEqual(95);
  });

  it('builds an energy curve with a morning peak, an afternoon dip, and a low point at bedtime', () => {
    const metrics = Array.from({ length: 7 }, (_, i) => night(8, `2026-07-${20 + i}T22:00:00.000Z`));
    const r = computeCircadianProfile(metrics, ASOF);
    const curve = r.value!.energyCurve;
    const peak = curve.find((p) => p.kind === 'peak' && p.label === 'Pic du matin');
    const dip = curve.find((p) => p.kind === 'dip');
    expect(peak?.time).toBe('09:30'); // wake 06:00 + 3.5 h
    expect(dip?.time).toBe('14:00'); // wake 06:00 + 8 h
    expect(curve.at(-1)?.time).toBe(r.value!.idealBedtime);
    expect(curve.at(-1)?.energy).toBeLessThan(0.3);
    // Strictly ordered by time across the waking day, no duplicates/backtracking.
    for (let i = 1; i < curve.length; i += 1) expect(curve[i]!.time > curve[i - 1]!.time).toBe(true);
  });
});
