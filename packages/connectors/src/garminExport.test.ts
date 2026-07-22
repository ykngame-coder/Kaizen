import { describe, expect, it } from 'vitest';
import {
  detectAndParseGarminFile,
  parseGarminBioMetrics,
  parseGarminSleep,
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

describe('parseGarminBioMetrics', () => {
  it('converts grams to kg from weight records only', () => {
    const out = parseGarminBioMetrics(BIO);
    expect(out).toHaveLength(1); // the metadata-only record is skipped
    expect(out[0]).toMatchObject({ type: 'weight', value: 110, unit: 'kg', source: 'garmin' });
    expect(out[0]?.measuredAt).toBe('2021-08-10T16:29:24.423Z');
  });
});

describe('detectAndParseGarminFile', () => {
  it('recognizes a sleep file', () => {
    expect(detectAndParseGarminFile(SLEEP)?.healthMetrics[0]?.type).toBe('sleep_duration');
  });
  it('recognizes a biometrics file', () => {
    expect(detectAndParseGarminFile(BIO)?.healthMetrics[0]?.type).toBe('weight');
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
