import { describe, expect, it } from 'vitest';
import { parseHealthExport, parseHealthExportText } from './healthImport';

describe('parseHealthExport', () => {
  it('parses metrics + activities and applies the declared source', () => {
    const r = parseHealthExport({
      source: 'garmin',
      metrics: [
        { type: 'hrv', value: 61, date: '2026-07-20T05:00:00Z' },
        { type: 'sleep_duration', value: 7.5, date: '2026-07-20T06:30:00Z' },
      ],
      activities: [
        { type: 'running', startedAt: '2026-07-20T18:00:00Z', durationSec: 1800, distanceM: 6500, avgHeartRate: 151.4 },
      ],
    });
    expect(r.healthMetrics).toHaveLength(2);
    expect(r.healthMetrics[0]).toMatchObject({ type: 'hrv', unit: 'ms', source: 'garmin' });
    expect(r.activities[0]).toMatchObject({ type: 'running', source: 'garmin', durationSec: 1800, avgHeartRate: 151 });
  });

  it('defaults an unknown source to manual and an unknown activity type to other', () => {
    const r = parseHealthExport({
      source: 'bogus',
      activities: [{ type: 'kitesurf', startedAt: '2026-07-20T18:00:00Z', durationSec: 600 }],
    });
    expect(r.activities[0]).toMatchObject({ source: 'manual', type: 'other' });
  });

  it('drops invalid metric/activity rows', () => {
    const r = parseHealthExport({
      metrics: [
        { type: 'steps', value: 8000, date: '2026-07-20T05:00:00Z' }, // unknown metric
        { type: 'hrv', value: 60, date: 'nope' }, // bad date
        { type: 'weight', value: 74, date: '2026-07-20T05:00:00Z' }, // ok
      ],
      activities: [{ type: 'running' }], // no start/duration
    });
    expect(r.healthMetrics).toHaveLength(1);
    expect(r.healthMetrics[0]?.type).toBe('weight');
    expect(r.activities).toHaveLength(0);
  });

  it('tolerates missing arrays and non-object input', () => {
    expect(parseHealthExport(null)).toEqual({ activities: [], healthMetrics: [], records: [] });
    expect(parseHealthExport({})).toEqual({ activities: [], healthMetrics: [], records: [] });
  });
});

describe('parseHealthExportText', () => {
  it('parses JSON text', () => {
    const r = parseHealthExportText('{"metrics":[{"type":"hrv","value":55,"date":"2026-07-20T05:00:00Z"}]}');
    expect(r.healthMetrics[0]?.value).toBe(55);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseHealthExportText('{not json')).toThrow();
  });
});
