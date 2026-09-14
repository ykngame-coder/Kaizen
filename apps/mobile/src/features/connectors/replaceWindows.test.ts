import { describe, expect, it } from 'vitest';
import type { ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';
import { fullReplaceWindows } from './replaceWindows';

const metric = (type: string, measuredAt: string, source = 'apple_health'): ImportedHealthMetric =>
  ({ type, value: 1, unit: 'x', source, reliability: 'high', measuredAt }) as ImportedHealthMetric;
const session = (startedAt: string): ImportedSleepSession =>
  ({ source: 'apple_health', startedAt, endedAt: startedAt, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, asleepMin: 1, inBedMin: 1 }) as ImportedSleepSession;

const now = new Date('2026-09-13T10:00:00.000Z');
const tomorrow = '2026-09-14T10:00:00.000Z';

describe('fullReplaceWindows', () => {
  it('une fenêtre par type présent, de sa donnée la plus ancienne à demain', () => {
    const out = fullReplaceWindows(
      {
        healthMetrics: [metric('weight', '2025-01-02T08:00:00.000Z'), metric('weight', '2024-03-01T08:00:00.000Z'), metric('steps', '2026-09-01T10:00:00.000Z')],
        sleepSessions: [session('2025-06-01T21:00:00.000Z')],
      },
      now,
    );
    expect(out).toEqual(
      expect.arrayContaining([
        { kind: 'weight', from: '2024-03-01T08:00:00.000Z', to: tomorrow },
        { kind: 'steps', from: '2026-09-01T10:00:00.000Z', to: tomorrow },
        { kind: 'sleep_session', from: '2025-06-01T21:00:00.000Z', to: tomorrow },
      ]),
    );
    expect(out).toHaveLength(3);
  });

  it('aucune fenêtre pour un type absent — la relecture vide ne remplace rien', () => {
    expect(fullReplaceWindows({ healthMetrics: [], sleepSessions: [] }, now)).toEqual([]);
  });

  it('ignore les autres sources et les types qu elle ne produit pas', () => {
    const out = fullReplaceWindows({ healthMetrics: [metric('weight', '2025-01-02T08:00:00.000Z', 'manual'), metric('vo2max', '2025-01-02T08:00:00.000Z')], sleepSessions: [] }, now);
    expect(out).toEqual([]);
  });
});
