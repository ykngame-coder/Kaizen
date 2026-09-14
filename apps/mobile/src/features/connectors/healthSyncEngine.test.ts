import { describe, expect, it, vi } from 'vitest';
import type { HKSleepSample, ImportedHealthMetric } from '@supotsu/connectors';
import type { ChangeSet, FullRead, HealthSource, HealthTypeKey } from './healthSource';
import { runHealthSync, type AnchorStore, type SyncPayload } from './healthSyncEngine';

const NOW = new Date('2026-09-13T10:00:00.000Z');
const DAY = 24 * 3600 * 1000;
const TYPES: HealthTypeKey[] = ['workouts', 'sleep', 'steps', 'HKQuantityTypeIdentifierBodyMass'];

const noChange = (type: HealthTypeKey): ChangeSet => ({
  added:
    type === 'workouts'
      ? { kind: 'workouts', workouts: [] }
      : type === 'sleep'
        ? { kind: 'sleep', samples: [] }
        : type === 'steps'
          ? { kind: 'steps', intervals: [] }
          : { kind: 'quantity', samples: [] },
  deletedUuids: [],
  newAnchor: `${type}-B`,
});

interface FakeOptions {
  changes?: Partial<Record<HealthTypeKey, ChangeSet | Error>>;
  full?: FullRead;
  sleep?: HKSleepSample[] | ((from: Date, to: Date) => HKSleepSample[]);
  steps?: ImportedHealthMetric[];
}

function fakeSource(o: FakeOptions = {}) {
  const calls: string[] = [];
  const source: HealthSource = {
    types: TYPES,
    authorize: async () => undefined,
    currentAnchor: async (t) => ({ anchor: `${t}-NOW`, via: 'empty-query' }),
    changesSince: async (t) => {
      calls.push(`changes:${t}`);
      const c = o.changes?.[t];
      if (c instanceof Error) throw c;
      return c ?? noChange(t);
    },
    readSleep: async (from, to) => {
      calls.push('readSleep');
      return typeof o.sleep === 'function' ? o.sleep(from, to) : (o.sleep ?? []);
    },
    stepTotals: async (from, to) => {
      calls.push(`stepTotals:${from.toISOString()}→${to.toISOString()}`);
      return o.steps ?? [];
    },
    readQuantity: async () => [],
    fullRead: async () => {
      calls.push('fullRead');
      return o.full ?? { activities: [], healthMetrics: [], sleepSessions: [] };
    },
  };
  return { source, calls };
}

function memoryAnchors(initial: Partial<Record<HealthTypeKey, string>> = {}, lastFull: Date | null = new Date(NOW.getTime() - DAY)) {
  const map = new Map<string, string>(Object.entries(initial) as [string, string][]);
  let last = lastFull;
  const store: AnchorStore = {
    get: async (t) => map.get(t) ?? null,
    set: async (t, a) => void map.set(t, a),
    clear: async () => {
      map.clear();
      last = null;
    },
    lastFullAt: async () => last,
    setLastFullAt: async (d) => void (last = d),
  };
  return { store, map, lastFull: () => last };
}

const allAnchored = (): Partial<Record<HealthTypeKey, string>> => Object.fromEntries(TYPES.map((t) => [t, `${t}-A`]));

function run(source: HealthSource, anchors: AnchorStore, persist: (p: SyncPayload) => Promise<void> = async () => undefined, mode: 'incremental' | 'full' = 'incremental') {
  return runHealthSync({ source, anchors, persist, now: () => NOW }, mode);
}

describe('runHealthSync', () => {
  it('première synchro : mode complet, ancres enregistrées APRÈS l enregistrement', async () => {
    const { source, calls } = fakeSource({
      full: { activities: [], sleepSessions: [], healthMetrics: [{ type: 'weight', value: 70, unit: 'kg', source: 'apple_health', measuredAt: '2025-01-01T08:00:00.000Z' }] },
    });
    const anchors = memoryAnchors({}, null);
    let anchorsAtPersist = -1;
    const report = await run(source, anchors.store, async (p) => {
      anchorsAtPersist = anchors.map.size;
      expect(p.replace.map((w) => w.kind)).toEqual(['weight']);
    });
    expect(calls).toContain('fullRead');
    expect(anchorsAtPersist).toBe(0);
    expect(anchors.map.get('sleep')).toBe('sleep-NOW');
    expect(anchors.lastFull()).toEqual(NOW);
    expect(report).toMatchObject({ mode: 'full', reason: 'no-anchor' });
    expect(report.anchorsVia.steps).toBe('empty-query');
  });

  it('enregistrement en échec : aucune ancre n avance', async () => {
    const { source } = fakeSource({
      changes: { workouts: { ...noChange('workouts'), added: { kind: 'workouts', workouts: [{ uuid: 'w1', workoutActivityType: 37, startDate: '2026-09-12T07:00:00.000Z', duration: 1800 }] } } },
    });
    const anchors = memoryAnchors(allAnchored());
    await expect(run(source, anchors.store, async () => Promise.reject(new Error('réseau')))).rejects.toThrow('réseau');
    expect(anchors.map.get('workouts')).toBe('workouts-A');
    expect(anchors.map.get('sleep')).toBe('sleep-A');
  });

  it('lecture d un type en échec : les autres avancent, pas lui', async () => {
    const { source } = fakeSource({ changes: { steps: new Error('boom') } });
    const anchors = memoryAnchors(allAnchored());
    const report = await run(source, anchors.store);
    expect(anchors.map.get('steps')).toBe('steps-A');
    expect(anchors.map.get('sleep')).toBe('sleep-B');
    expect(report.perType.steps?.error).toBe('boom');
    expect(report.mode).toBe('incremental');
  });

  it('séance supprimée : sa ligne est visée par son identifiant', async () => {
    const { source } = fakeSource({ changes: { workouts: { ...noChange('workouts'), deletedUuids: ['u1'] } } });
    const persist = vi.fn(async (_p: SyncPayload) => undefined);
    await run(source, memoryAnchors(allAnchored()).store, persist);
    expect(persist.mock.calls[0]![0].deletedActivityExternalIds).toEqual(['applehealth-u1']);
  });

  it('pas supprimés : recalcul et remplacement sur 30 jours', async () => {
    const { source, calls } = fakeSource({
      changes: { steps: { ...noChange('steps'), deletedUuids: ['s1'] } },
      steps: [{ type: 'steps', value: 5000, unit: 'count', source: 'apple_health', measuredAt: '2026-09-10T10:00:00.000Z' }],
    });
    const persist = vi.fn(async (_p: SyncPayload) => undefined);
    await run(source, memoryAnchors(allAnchored()).store, persist);
    const p = persist.mock.calls[0]![0];
    const steps = p.replace.find((w) => w.kind === 'steps');
    expect(steps).toBeDefined();
    // 30 jours aujourd'hui compris : la fenêtre commence 29 jours avant aujourd'hui, à minuit local.
    const keepFrom = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 29);
    expect(steps!.from).toBe(keepFrom.toISOString());
    expect(calls.some((c) => c.startsWith(`stepTotals:${keepFrom.toISOString()}`))).toBe(true);
    expect(p.healthMetrics).toHaveLength(1);
  });

  it('pas ajoutés : seuls les jours touchés sont relus', async () => {
    const { source, calls } = fakeSource({
      changes: { steps: { ...noChange('steps'), added: { kind: 'steps', intervals: [{ startDate: new Date(2026, 8, 12, 9).toISOString(), endDate: new Date(2026, 8, 12, 9, 10).toISOString() }] } } },
    });
    await run(source, memoryAnchors(allAnchored()).store);
    expect(calls.filter((c) => c.startsWith('stepTotals'))).toEqual([
      `stepTotals:${new Date(2026, 8, 12).toISOString()}→${new Date(2026, 8, 13).toISOString()}`,
    ]);
  });

  it('nuit arrivée en deux morceaux : une seule session, l ancienne découpe remplacée', async () => {
    const first = { value: 3, startDate: '2026-09-11T21:00:00.000Z', endDate: '2026-09-12T01:00:00.000Z' };
    const second = { value: 5, startDate: '2026-09-12T01:00:00.000Z', endDate: '2026-09-12T05:00:00.000Z' };
    const anchors = memoryAnchors(allAnchored());

    const sync1 = fakeSource({ changes: { sleep: { ...noChange('sleep'), added: { kind: 'sleep', samples: [first] } } }, sleep: [first] });
    const persist1 = vi.fn(async (_p: SyncPayload) => undefined);
    await run(sync1.source, anchors.store, persist1);
    expect(persist1.mock.calls[0]![0].sleepSessions.map((s) => [s.startedAt, s.endedAt])).toEqual([[first.startDate, first.endDate]]);

    const sync2 = fakeSource({ changes: { sleep: { ...noChange('sleep'), added: { kind: 'sleep', samples: [second] } } }, sleep: [first, second] });
    const persist2 = vi.fn(async (_p: SyncPayload) => undefined);
    await run(sync2.source, anchors.store, persist2);
    const p = persist2.mock.calls[0]![0];
    expect(p.sleepSessions.map((s) => [s.startedAt, s.endedAt])).toEqual([[first.startDate, second.endDate]]);
    expect(p.replace).toContainEqual({ kind: 'sleep_session', from: first.startDate, to: new Date(new Date(second.endDate).getTime() + 1).toISOString() });
  });

  it('filet : mode complet au-delà de 7 jours, pas avant', async () => {
    const late = fakeSource();
    const r1 = await run(late.source, memoryAnchors(allAnchored(), new Date(NOW.getTime() - 8 * DAY)).store);
    expect(r1).toMatchObject({ mode: 'full', reason: 'weekly' });

    const recent = fakeSource();
    const r2 = await run(recent.source, memoryAnchors(allAnchored(), new Date(NOW.getTime() - 6 * DAY)).store);
    expect(r2.mode).toBe('incremental');
    expect(recent.calls).not.toContain('fullRead');
  });

  it('relecture complète vide pour un type : aucun remplacement pour lui', async () => {
    const { source } = fakeSource({
      full: { activities: [], sleepSessions: [], healthMetrics: [{ type: 'steps', value: 1, unit: 'count', source: 'apple_health', measuredAt: '2026-09-12T10:00:00.000Z' }] },
    });
    const persist = vi.fn(async (_p: SyncPayload) => undefined);
    await run(source, memoryAnchors({}, null).store, persist, 'full');
    expect(persist.mock.calls[0]![0].replace.map((w) => w.kind)).toEqual(['steps']);
  });

  it('ancre refusée : ancres effacées, bascule en mode complet', async () => {
    const { source, calls } = fakeSource({ changes: { sleep: new Error('Invalid anchor') } });
    const anchors = memoryAnchors(allAnchored());
    const report = await run(source, anchors.store);
    expect(calls).toContain('fullRead');
    expect(report).toMatchObject({ mode: 'full', reason: 'anchor-rejected' });
    expect(anchors.map.get('sleep')).toBe('sleep-NOW');
  });

  it('rien de nouveau : pas d écriture, mais les ancres avancent', async () => {
    const { source } = fakeSource();
    const anchors = memoryAnchors(allAnchored());
    const persist = vi.fn(async (_p: SyncPayload) => undefined);
    await run(source, anchors.store, persist);
    expect(persist).not.toHaveBeenCalled();
    expect(anchors.map.get('workouts')).toBe('workouts-B');
  });
});
