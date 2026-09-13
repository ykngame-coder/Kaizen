import { describe, expect, it } from 'vitest';
import type { ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';
import { syncWindow, trimToWindow } from './syncWindow';

const local = (d: number, h = 0, mi = 0): Date => new Date(2026, 8, d, h, mi, 0, 0);

describe('syncWindow', () => {
  it('7 jours aujourd hui compris, plus un jour de marge, alignés sur minuit', () => {
    const w = syncWindow(7, local(13, 15, 42));
    expect(w.keepFrom).toEqual(local(7));
    expect(w.since).toEqual(local(6));
  });

  it('reste sur minuit local à travers un changement d heure', () => {
    // 29 mars (Europe) et 8 mars (Amérique du Nord) dans la fenêtre.
    for (const now of [new Date(2026, 3, 2, 9), new Date(2026, 2, 12, 9)]) {
      const w = syncWindow(7, now);
      expect([w.since.getHours(), w.since.getMinutes()]).toEqual([0, 0]);
      expect([w.keepFrom.getHours(), w.keepFrom.getMinutes()]).toEqual([0, 0]);
    }
  });
});

describe('trimToWindow', () => {
  const metric = (type: string, at: Date): ImportedHealthMetric =>
    ({ type, value: 1, unit: 'x', source: 'apple_health', reliability: 'high', measuredAt: at.toISOString() }) as ImportedHealthMetric;
  const session = (start: Date, end: Date): ImportedSleepSession =>
    ({ source: 'apple_health', startedAt: start.toISOString(), endedAt: end.toISOString(), deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, asleepMin: 60, inBedMin: 60 }) as ImportedSleepSession;
  const keepFrom = local(7);

  it('écarte les totaux journaliers du jour de marge — ils seraient incomplets', () => {
    const out = trimToWindow(
      { healthMetrics: [metric('steps', local(6, 12)), metric('sleep_duration', local(6, 12)), metric('steps', local(7, 12))], sleepSessions: [] },
      keepFrom,
    );
    expect(out.healthMetrics.map((m) => [m.type, m.measuredAt])).toEqual([['steps', local(7, 12).toISOString()]]);
  });

  it('garde les mesures ponctuelles du jour de marge — elles sont complètes', () => {
    const out = trimToWindow({ healthMetrics: [metric('weight', local(6, 8))], sleepSessions: [] }, keepFrom);
    expect(out.healthMetrics).toHaveLength(1);
  });

  it('garde la nuit commencée la veille au soir du premier jour, écarte celle vue à moitié', () => {
    const vueAMoitie = session(local(5, 23), local(6, 7)); // commence avant la lecture
    const sieste = session(local(6, 15), local(6, 16));
    const premiereNuit = session(local(6, 22, 30), local(7, 6, 45)); // lue grâce à la marge
    const out = trimToWindow({ healthMetrics: [], sleepSessions: [vueAMoitie, sieste, premiereNuit] }, keepFrom);
    expect(out.sleepSessions).toEqual([premiereNuit]);
  });

  it('laisse passer le reste du résultat tel quel', () => {
    const out = trimToWindow({ healthMetrics: [], sleepSessions: [], activities: ['a'] }, keepFrom);
    expect(out.activities).toEqual(['a']);
  });
});
