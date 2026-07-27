import { describe, expect, it } from 'vitest';
import { haeDateToIso, healthAutoExportToSupotsu, isHealthAutoExport } from './healthAutoExport';
import { parseHealthExport } from './healthImport';

const sample = {
  data: {
    metrics: [
      { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-07-26 00:00:00 +0200', qty: 56 }] },
      { name: 'weight_body_mass', units: 'kg', data: [{ date: '2026-07-22 00:00:00 +0200', qty: 102.7 }] },
      { name: 'body_fat_percentage', units: '%', data: [{ date: '2026-07-21 00:00:00 +0200', qty: 30.5 }] },
      { name: 'dietary_water', units: 'mL', data: [{ date: '2026-07-05 00:00:00 +0200', qty: 3000 }] },
      { name: 'step_count', units: 'count', data: [{ date: '2026-07-26 00:00:00 +0200', qty: 4225 }] }, // ignored
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [{ date: '2026-07-26 00:00:00 +0200', sleepEnd: '2026-07-26 09:01:41 +0200', totalSleep: 5.8, inBed: 5.82 }],
      },
    ],
    workouts: [
      {
        id: 'abc',
        name: 'Entraînement par Intervalles de Haute Intensité',
        start: '2026-07-23 06:57:27 +0200',
        end: '2026-07-23 07:13:39 +0200',
        duration: 972.7,
        distance: { qty: 0, units: 'km' },
        activeEnergyBurned: { qty: 644.336, units: 'kJ' },
        heartRate: { avg: { qty: 126.75 }, max: { qty: 158 } },
      },
    ],
  },
};

describe('isHealthAutoExport', () => {
  it('detects the native shape', () => {
    expect(isHealthAutoExport(sample)).toBe(true);
    expect(isHealthAutoExport({ metrics: [] })).toBe(false);
    expect(isHealthAutoExport(null)).toBe(false);
  });
});

describe('haeDateToIso', () => {
  it('converts a "+0200" timestamp to UTC ISO', () => {
    expect(haeDateToIso('2026-07-26 09:01:41 +0200')).toBe('2026-07-26T07:01:41.000Z');
  });
  it('rejects garbage', () => {
    expect(haeDateToIso('not a date')).toBeUndefined();
  });
});

describe('healthAutoExportToSupotsu', () => {
  const conv = healthAutoExportToSupotsu(sample)!;

  it('maps supported metrics and skips the rest', () => {
    const types = conv.metrics.map((m) => m.type);
    expect(types).toContain('resting_heart_rate');
    expect(types).toContain('weight');
    expect(types).toContain('body_fat');
    expect(types).toContain('hydration');
    expect(types).not.toContain('step_count' as never);
  });

  it('derives sleep duration and efficiency', () => {
    const dur = conv.metrics.find((m) => m.type === 'sleep_duration')!;
    const eff = conv.metrics.find((m) => m.type === 'sleep_efficiency')!;
    expect(dur.value).toBe(5.8);
    expect(eff.value).toBeGreaterThan(95);
  });

  it('maps a HIIT workout and converts kJ→kcal', () => {
    const a = conv.activities[0]!;
    expect(a.type).toBe('cross_training');
    expect(a.durationSec).toBe(973);
    expect(a.avgHeartRate).toBe(127);
    expect(a.calories).toBe(Math.round(644.336 / 4.184));
    expect(a.externalId).toBe('hae-abc');
  });

  it('flows through parseHealthExport end to end', () => {
    const parsed = parseHealthExport(sample);
    expect(parsed.healthMetrics.some((m) => m.type === 'resting_heart_rate' && m.source === 'apple_health')).toBe(true);
    expect(parsed.activities).toHaveLength(1);
  });
});
