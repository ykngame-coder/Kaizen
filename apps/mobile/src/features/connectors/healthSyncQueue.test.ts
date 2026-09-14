import { describe, expect, it } from 'vitest';
import { createSyncQueue } from './healthSyncQueue';
import type { SyncMode } from './healthSyncEngine';

/** Une exécution qu'on termine à la main, pour contrôler l'entrelacement. */
function controllableRun() {
  const runs: { mode: SyncMode; finish: () => void; fail: () => void }[] = [];
  const run = (mode: SyncMode) =>
    new Promise<void>((resolve, reject) => {
      runs.push({ mode, finish: resolve, fail: () => reject(new Error('échec')) });
    });
  return { run, runs };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createSyncQueue', () => {
  it('dix demandes simultanées : une exécution, plus un seul tour', async () => {
    const { run, runs } = controllableRun();
    const request = createSyncQueue(run);
    const all = Array.from({ length: 10 }, () => request('incremental'));
    await tick();
    expect(runs).toHaveLength(1);
    runs[0]!.finish();
    await tick();
    expect(runs).toHaveLength(2);
    runs[1]!.finish();
    await Promise.all(all);
    expect(runs).toHaveLength(2);
  });

  it('une demande complète en attente l emporte sur les incrémentales', async () => {
    const { run, runs } = controllableRun();
    const request = createSyncQueue(run);
    void request('incremental');
    await tick();
    void request('incremental');
    void request('full');
    void request('incremental');
    runs[0]!.finish();
    await tick();
    expect(runs.map((r) => r.mode)).toEqual(['incremental', 'full']);
    runs[1]!.finish();
  });

  it('chaque promesse se résout après l exécution qui la couvre', async () => {
    const { run, runs } = controllableRun();
    const request = createSyncQueue(run);
    let firstDone = false;
    let secondDone = false;
    void request('incremental').then(() => (firstDone = true));
    await tick();
    void request('incremental').then(() => (secondDone = true));
    runs[0]!.finish();
    await tick();
    expect([firstDone, secondDone]).toEqual([true, false]);
    runs[1]!.finish();
    await tick();
    expect(secondDone).toBe(true);
  });

  it('une exécution qui échoue ne bloque pas la suivante', async () => {
    const { run, runs } = controllableRun();
    const request = createSyncQueue(run);
    const first = request('incremental');
    await tick();
    runs[0]!.fail();
    await first;
    const second = request('full');
    await tick();
    expect(runs).toHaveLength(2);
    runs[1]!.finish();
    await second;
  });
});
