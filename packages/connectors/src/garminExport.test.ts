import { describe, expect, it } from 'vitest';
import {
  detectAndParseGarminFile,
  parseGarminActivities,
  parseGarminBenchmarks,
  parseGarminBioMetrics,
  parseGarminDailySummary,
  parseGarminHealthStatus,
  parseGarminPersonalRecords,
  parseGarminSleep,
  parseGarminSleepSessions,
  parseImportFile,
} from './garminExport';

// Real shapes from a Garmin RGPD export (DI-Connect-Wellness).
const SLEEP = [
  // First night: no stage data → skipped.
  { sleepStartTimestampGMT: '2021-08-09T21:50:00.0', sleepEndTimestampGMT: '2021-08-10T05:00:00.0', calendarDate: '2021-08-10' },
  {
    sleepStartTimestampGMT: '2021-08-10T22:57:00.0',
    sleepEndTimestampGMT: '2021-08-11T05:46:00.0',
    calendarDate: '2021-08-11',
    deepSleepSeconds: 1560,
    lightSleepSeconds: 15780,
    remSleepSeconds: 5940,
    awakeSleepSeconds: 0,
  },
];

const BIO = [
  { version: 1, metaData: { calendarDate: '2021-08-10T18:28:36.8' }, userSetNullForWeight: true },
  {
    version: 2,
    metaData: { calendarDate: '2021-08-10T18:29:24.423' },
    weight: { weight: 110000.0, sourceType: 'USER_SETTING', timestampGMT: '2021-08-10T16:29:24.423' },
  },
];

describe('parseGarminSleep', () => {
  it('sums sleep stages to hours and treats GMT as UTC', () => {
    const out = parseGarminSleep(SLEEP);
    expect(out).toHaveLength(1); // first night skipped (no stages)
    // 1560 + 15780 + 5940 = 23280 s = 6.47 h
    expect(out[0]).toMatchObject({ type: 'sleep_duration', value: 6.47, unit: 'h', source: 'garmin' });
    expect(out[0]?.measuredAt).toBe('2021-08-11T05:46:00.000Z');
  });
});

describe('parseGarminSleepSessions', () => {
  it('builds one session per night with stage minutes, skipping nights with no stage data', () => {
    const out = parseGarminSleepSessions(SLEEP);
    expect(out).toHaveLength(1); // first night skipped (no stages → asleepMin 0)
    expect(out[0]).toMatchObject({
      source: 'garmin',
      startedAt: '2021-08-10T22:57:00.000Z',
      endedAt: '2021-08-11T05:46:00.000Z',
      deepMin: 26, // 1560 s
      lightMin: 263, // 15780 s
      remMin: 99, // 5940 s
      awakeMin: 0,
      asleepMin: 388,
      inBedMin: 388,
    });
  });
});

describe('parseGarminBioMetrics', () => {
  it('converts grams to kg from weight records only', () => {
    const out = parseGarminBioMetrics(BIO);
    expect(out).toHaveLength(1); // the metadata-only record is skipped
    expect(out[0]).toMatchObject({ type: 'weight', value: 110, unit: 'kg', source: 'garmin' });
    expect(out[0]?.measuredAt).toBe('2021-08-10T16:29:24.423Z');
  });
});

// Real shape from DI-Connect-Wellness/*_healthStatusData.json.
const HEALTH_STATUS = [
  {
    calendarDate: '2025-09-17',
    createTimestampUTC: '2025-09-17T13:25:39.154',
    metrics: [
      { type: 'HRV', value: 0.0, status: 'UNKNOWN' }, // not measured → skip
      { type: 'HR', value: 0.0, status: 'UNKNOWN' },
    ],
  },
  {
    calendarDate: '2025-09-18',
    createTimestampUTC: '2025-09-18T16:54:56.716',
    metrics: [
      { type: 'HRV', value: 72.0, status: 'ONBOARDING' },
      { type: 'HR', value: 58.0, status: 'ONBOARDING' },
      { type: 'SPO2', value: 98.0, status: 'ONBOARDING' }, // not modelled → skip
      { type: 'RESPIRATION', value: 12.6, status: 'ONBOARDING' }, // skip
    ],
  },
];

describe('parseGarminHealthStatus', () => {
  it('extracts HRV + resting HR, skipping unmeasured and unmodelled metrics', () => {
    const out = parseGarminHealthStatus(HEALTH_STATUS);
    expect(out).toHaveLength(2); // HRV + HR for the 09-18 night only
    const hrv = out.find((m) => m.type === 'hrv');
    const hr = out.find((m) => m.type === 'resting_heart_rate');
    expect(hrv).toMatchObject({ value: 72, unit: 'ms', source: 'garmin' });
    expect(hr).toMatchObject({ value: 58, unit: 'bpm', source: 'garmin' });
    expect(hrv?.measuredAt).toBe('2025-09-18T00:00:00.000Z');
  });
});

// Real shapes from DI-Connect-Aggregator/UDSFile + DI-Connect-Fitness.
const DAILY = [
  {
    calendarDate: '2022-06-14',
    restingHeartRate: 59,
    allDayStress: {
      aggregatorList: [
        { type: 'TOTAL', averageStressLevel: 37 },
        { type: 'ASLEEP', averageStressLevel: -2 },
      ],
    },
  },
];

const ACTIVITIES_FILE = [
  {
    summarizedActivitiesExport: [
      { activityId: 11587211088, activityType: 'running', startTimeGmt: 1689677507000, duration: 2366877.9, distance: 313955.0, calories: 1768.18, avgHr: 127 },
      { activityId: 1, activityType: 'strength_training', startTimeGmt: 1698119559000, duration: 968124.0, distance: 0, calories: 427.38, avgHr: 106 },
    ],
  },
];

describe('parseGarminDailySummary', () => {
  it('extracts resting HR and TOTAL stress, skipping negative (asleep) stress', () => {
    const out = parseGarminDailySummary(DAILY);
    expect(out.map((m) => m.type).sort()).toEqual(['resting_heart_rate', 'stress']);
    expect(out.find((m) => m.type === 'stress')).toMatchObject({ value: 37, unit: 'score', source: 'garmin' });
    expect(out.find((m) => m.type === 'resting_heart_rate')?.value).toBe(59);
  });
});

describe('parseGarminActivities', () => {
  it('converts ms→s, cm→m and maps the sport type', () => {
    const flat = ACTIVITIES_FILE.flatMap((f) => f.summarizedActivitiesExport);
    const out = parseGarminActivities(flat);
    expect(out[0]).toMatchObject({
      externalId: 'garmin-11587211088',
      type: 'running',
      source: 'garmin',
      durationSec: 2367, // 2366877.9 ms
      distanceM: 3140, // 313955 cm
      calories: 1768,
      avgHeartRate: 127,
    });
    expect(out[0]?.startedAt).toBe('2023-07-18T10:51:47.000Z');
    expect(out[1]?.type).toBe('strength');
    expect(out[1]?.distanceM).toBeUndefined(); // distance 0 → omitted
  });
});

// Real shapes from *_benchmarks.json and *_personalRecord.json.
const BENCHMARKS = [
  { id: 697149, benchmarkKey: 'BARBELL_BENCH_PRESS', reps: 1, maxWeight: 81.0, oneRepMax: 81.0, dateSet: '2025-10-28T10:06:07.0' },
  { id: 637708, benchmarkKey: 'BARBELL_DEADLIFT', reps: 1, maxWeight: 135.0, oneRepMax: 135.0, dateSet: '2026-03-05T05:03:58.0' },
];

const PERSONAL_RECORDS = [
  {
    personalRecords: [
      { personalRecordId: 2586140275, personalRecordType: 'Max Rep Weight (Barbell Deadlift)', value: 107000.0, prStartTimeGMT: 'Mon Jan 27 10:41:59 GMT 2025', createdDate: '2025-01-27' },
      { personalRecordId: 2809019465, personalRecordType: 'Best 5km Run', value: 1826.55, prStartTimeGMT: 'Mon Dec 15 17:46:09 GMT 2025', createdDate: '2025-12-15' },
      { personalRecordId: 2879016364, personalRecordType: 'Farthest Run', value: 10046.72, prStartTimeGMT: 'Sat Mar 21 20:20:05 GMT 2026', createdDate: '2026-03-21' },
      { personalRecordId: 1, personalRecordType: 'Current Goal Streak', value: 0.0, prStartTimeGMT: 'Tue Jul 21 22:00:00 GMT 2026', createdDate: '2021-08-10' },
    ],
  },
];

describe('parseGarminBenchmarks', () => {
  it('maps 1RM to strength records in kg with a readable label', () => {
    const out = parseGarminBenchmarks(BENCHMARKS);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ category: 'strength', unit: 'kg', value: 81, source: 'garmin' });
    expect(out[0]?.label).toBe('Barbell Bench Press (1RM)');
    expect(out[1]?.achievedAt).toBe('2026-03-05T05:03:58.000Z');
  });
});

describe('parseGarminPersonalRecords', () => {
  it('classifies strength (g→kg), run time, run distance and skips streaks', () => {
    const out = parseGarminPersonalRecords(PERSONAL_RECORDS);
    const byLabel = Object.fromEntries(out.map((r) => [r.label, r]));
    expect(out).toHaveLength(3); // streak skipped
    expect(byLabel['Max Rep Weight (Barbell Deadlift)']).toMatchObject({ category: 'strength', unit: 'kg', value: 107 });
    expect(byLabel['Best 5km Run']).toMatchObject({ category: 'run', unit: 's', value: 1826.55 });
    expect(byLabel['Farthest Run']).toMatchObject({ category: 'run', unit: 'm', value: 10046.72 });
    expect(byLabel['Best 5km Run']?.achievedAt).toBe('2025-12-15T17:46:09.000Z');
  });
});

describe('detectAndParseGarminFile', () => {
  it('recognizes a sleep file', () => {
    const parsed = detectAndParseGarminFile(SLEEP);
    expect(parsed?.healthMetrics[0]?.type).toBe('sleep_duration');
    expect(parsed?.sleepSessions).toHaveLength(1);
  });
  it('recognizes a biometrics file', () => {
    expect(detectAndParseGarminFile(BIO)?.healthMetrics[0]?.type).toBe('weight');
  });
  it('recognizes a health-status file (HRV/HR)', () => {
    const types = detectAndParseGarminFile(HEALTH_STATUS)?.healthMetrics.map((m) => m.type);
    expect(types).toContain('hrv');
    expect(types).toContain('resting_heart_rate');
  });
  it('recognizes a daily-summary file (stress)', () => {
    expect(detectAndParseGarminFile(DAILY)?.healthMetrics.some((m) => m.type === 'stress')).toBe(true);
  });
  it('recognizes an activities file (nested export)', () => {
    const res = detectAndParseGarminFile(ACTIVITIES_FILE);
    expect(res?.activities).toHaveLength(2);
    expect(res?.activities[0]?.type).toBe('running');
  });
  it('returns null for an unrelated array', () => {
    expect(detectAndParseGarminFile([{ foo: 1 }])).toBeNull();
    expect(detectAndParseGarminFile({ not: 'array' })).toBeNull();
  });
});

describe('parseImportFile', () => {
  it('routes Garmin files to the adapter and Supotsu files to the plain parser', () => {
    expect(parseImportFile(SLEEP).healthMetrics[0]?.source).toBe('garmin');
    const supotsu = parseImportFile({ source: 'manual', metrics: [{ type: 'hrv', value: 55, date: '2026-07-20T05:00:00Z' }] });
    expect(supotsu.healthMetrics[0]).toMatchObject({ type: 'hrv', source: 'manual' });
  });
});
