import { describe, expect, it } from 'vitest';
import {
  isHealthAutoExport,
  parseHealthAutoExport,
  parseHealthAutoExportSleep,
  parseHealthAutoExportSleepSessions,
  parseHealthAutoExportWorkouts,
  resolveHaeSource,
} from './healthAutoExport';
import { parseImportFile } from './garminExport';

// Real shapes taken from a Health Auto Export archive (source "Connect").
const SLEEP_NIGHT = {
  core: 3.033055555555555,
  source: 'Connect',
  inBedEnd: '2026-06-26 09:16:30 +0200',
  inBedStart: '2026-06-26 01:30:30 +0200',
  asleep: 0,
  sleepEnd: '2026-06-26 09:16:30 +0200',
  rem: 1.25,
  totalSleep: 6.566388888888888,
  awake: 1.2,
  date: '2026-06-26 00:00:00 +0200',
  sleepStart: '2026-06-26 01:30:31 +0200',
  deep: 2.283333333333333,
  inBed: 7.766666666666667,
};

const WORKOUT = {
  id: 'A4DD2894-6909-4479-B347-9B861D58D570',
  name: 'Entraînement par Intervalles de Haute Intensité',
  start: '2026-07-23 06:57:27 +0200',
  end: '2026-07-23 07:13:39 +0200',
  duration: 972.7340087890625,
  distance: { qty: 0, units: 'km' },
  activeEnergyBurned: { qty: 644.336, units: 'kJ' },
  totalEnergy: { qty: 757.304, units: 'kJ' },
  avgHeartRate: { qty: 126.75, units: 'count/min' },
};

describe('parseHealthAutoExportSleep', () => {
  it('maps a night to sleep_duration (bedtime) + real efficiency', () => {
    const out = parseHealthAutoExportSleep([SLEEP_NIGHT]);
    const dur = out.find((m) => m.type === 'sleep_duration');
    const eff = out.find((m) => m.type === 'sleep_efficiency');
    expect(dur?.value).toBeCloseTo(6.57, 1);
    expect(dur?.unit).toBe('h');
    // measuredAt is the bedtime (sleepStart), normalized to UTC (+02:00).
    expect(dur?.measuredAt).toBe('2026-06-25T23:30:31.000Z');
    // 6.566 / 7.767 ≈ 84.5 %
    expect(eff?.value).toBeCloseTo(84.5, 0);
    expect(eff?.value).toBeLessThanOrEqual(100);
  });

  it('falls back to stage sum when totalSleep is absent', () => {
    const { totalSleep, ...noTotal } = SLEEP_NIGHT;
    void totalSleep;
    const out = parseHealthAutoExportSleep([noTotal]);
    const dur = out.find((m) => m.type === 'sleep_duration');
    // deep + core + rem = 2.283 + 3.033 + 1.25 ≈ 6.57
    expect(dur?.value).toBeCloseTo(6.57, 1);
  });

  it('skips nights without a usable asleep value', () => {
    expect(parseHealthAutoExportSleep([{ date: '2026-06-26 00:00:00 +0200' }])).toHaveLength(0);
  });
});

describe('parseHealthAutoExportSleepSessions', () => {
  it('maps a night to stage minutes without fabricating a timeline', () => {
    const [s] = parseHealthAutoExportSleepSessions([SLEEP_NIGHT]);
    expect(s?.source).toBe('garmin'); // source "Connect" → Garmin
    expect(s?.startedAt).toBe('2026-06-25T23:30:31.000Z'); // sleepStart
    expect(s?.endedAt).toBe('2026-06-26T07:16:30.000Z'); // sleepEnd
    expect(s?.deepMin).toBe(137); // 2.283 h
    expect(s?.lightMin).toBe(182); // 3.033 h (core)
    expect(s?.remMin).toBe(75); // 1.25 h
    expect(s?.awakeMin).toBe(72); // 1.2 h
    expect(s?.asleepMin).toBe(394); // 6.566 h
    expect(s?.inBedMin).toBe(466); // 7.767 h
    expect(s?.segments).toBeUndefined(); // no minute-by-minute data in the export
  });

  it('skips nights missing start or end', () => {
    expect(parseHealthAutoExportSleepSessions([{ deep: 1 }])).toHaveLength(0);
  });
});

describe('resolveHaeSource (Renpho & co. provenance)', () => {
  it('maps the per-sample source string to the real provider', () => {
    expect(resolveHaeSource('Renpho | RENPHO Health')).toBe('renpho');
    expect(resolveHaeSource('Connect')).toBe('garmin');
    expect(resolveHaeSource('Withings')).toBe('withings');
    expect(resolveHaeSource('Oura')).toBe('oura');
    expect(resolveHaeSource('MyFitnessPal')).toBe('apple_health'); // unknown → Apple Santé
    expect(resolveHaeSource(undefined)).toBe('apple_health');
  });

  it('attributes Renpho body-composition samples to the renpho source', () => {
    const archive = {
      data: {
        metrics: [
          { name: 'weight_body_mass', units: 'kg', data: [{ qty: 102.7, date: '2026-06-26 00:00:00 +0200', source: 'Renpho | RENPHO Health' }] },
          { name: 'body_fat_percentage', units: '%', data: [{ qty: 30.5, date: '2026-06-26 00:00:00 +0200', source: 'Renpho | RENPHO Health' }] },
          { name: 'lean_body_mass', units: 'kg', data: [{ qty: 71.4, date: '2026-06-26 00:00:00 +0200', source: 'Renpho | RENPHO Health' }] },
          { name: 'resting_heart_rate', units: 'count/min', data: [{ qty: 51, date: '2026-06-26 00:00:00 +0200', source: 'Connect' }] },
        ],
      },
    };
    const out = parseHealthAutoExport(archive)!;
    const renpho = out.healthMetrics.filter((m) => m.source === 'renpho').map((m) => m.type).sort();
    expect(renpho).toEqual(['body_fat', 'muscle_mass', 'weight']);
    expect(out.healthMetrics.find((m) => m.type === 'resting_heart_rate')?.source).toBe('garmin');
  });
});

describe('parseHealthAutoExportWorkouts', () => {
  it('maps a HIIT workout to a cross_training activity', () => {
    const [a] = parseHealthAutoExportWorkouts([WORKOUT]);
    expect(a?.type).toBe('cross_training');
    expect(a?.source).toBe('apple_health');
    expect(a?.externalId).toBe('hae-A4DD2894-6909-4479-B347-9B861D58D570');
    expect(a?.durationSec).toBe(973);
    expect(a?.avgHeartRate).toBe(127);
    // 644.336 kJ → ~154 kcal, distance 0 → undefined
    expect(a?.calories).toBe(154);
    expect(a?.distanceM).toBeUndefined();
  });

  it('classifies localized names', () => {
    const names = [
      { name: 'Course à pied extérieure', start: WORKOUT.start, duration: 60 },
      { name: 'Extérieur Marcher', start: WORKOUT.start, duration: 60 },
      { name: 'Entraînement de force traditionnel', start: WORKOUT.start, duration: 60 },
      { name: 'Aviron', start: WORKOUT.start, duration: 60 },
      { name: 'Football', start: WORKOUT.start, duration: 60 },
    ];
    expect(parseHealthAutoExportWorkouts(names).map((a) => a.type)).toEqual([
      'running',
      'walking',
      'strength',
      'cross_training',
      'other',
    ]);
  });
});

describe('parseHealthAutoExport', () => {
  const archive = {
    data: {
      metrics: [
        { name: 'sleep_analysis', units: 'hr', data: [SLEEP_NIGHT] },
        { name: 'resting_heart_rate', units: 'count/min', data: [{ qty: 51, date: '2026-06-26 00:00:00 +0200' }] },
        { name: 'weight_body_mass', units: 'kg', data: [{ qty: 102.7, date: '2026-06-26 00:00:00 +0200' }] },
        { name: 'body_fat_percentage', units: '%', data: [{ qty: 30.5, date: '2026-06-26 00:00:00 +0200' }] },
        { name: 'lean_body_mass', units: 'kg', data: [{ qty: 71.39, date: '2026-06-26 00:00:00 +0200' }] },
        { name: 'dietary_water', units: 'mL', data: [{ qty: 3000, date: '2026-06-26 00:00:00 +0200' }] },
        { name: 'step_count', units: 'count', data: [{ qty: 1200, date: '2026-06-26 00:00:00 +0200' }] },
      ],
      workouts: [WORKOUT],
    },
  };

  it('detects the archive shape', () => {
    expect(isHealthAutoExport(archive)).toBe(true);
    expect(isHealthAutoExport([])).toBe(false);
    expect(isHealthAutoExport({ metrics: [] })).toBe(false);
  });

  it('maps modeled metrics and skips the rest', () => {
    const out = parseHealthAutoExport(archive)!;
    const types = out.healthMetrics.map((m) => m.type).sort();
    expect(types).toEqual(
      ['body_fat', 'hydration', 'muscle_mass', 'resting_heart_rate', 'sleep_duration', 'sleep_efficiency', 'weight'].sort(),
    );
    // step_count is unmodeled → dropped, no throw.
    expect(out.healthMetrics.find((m) => m.type === 'body_fat')?.value).toBe(30.5);
    expect(out.healthMetrics.find((m) => m.type === 'muscle_mass')?.value).toBe(71.39);
    expect(out.healthMetrics.find((m) => m.type === 'hydration')?.value).toBe(3000);
    expect(out.activities).toHaveLength(1);
  });

  it('returns null for non-HAE input', () => {
    expect(parseHealthAutoExport([{ sleepEndTimestampGMT: 'x' }])).toBeNull();
    expect(parseHealthAutoExport({ metrics: [] })).toBeNull();
  });

  it('is picked up by the unified parseImportFile', () => {
    const parsed = parseImportFile(archive);
    expect(parsed.activities.length).toBe(1);
    expect(parsed.healthMetrics.length).toBeGreaterThan(0);
  });
});
