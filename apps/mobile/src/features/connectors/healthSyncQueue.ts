import type { SyncMode } from './healthSyncEngine';

/**
 * Une seule synchro Santé à la fois.
 *
 * L'app s'abonne séparément à huit types de données, et chaque abonnement
 * déclenchait sa propre synchro : une arrivée de données touchant plusieurs
 * types lançait plusieurs relectures en parallèle, qui écrivaient les mêmes
 * lignes et se disputaient les ancres.
 *
 * Désormais, une demande pendant une exécution ne lance rien : elle programme
 * UN tour de plus à la fin, quel que soit le nombre de demandes. Une demande
 * complète en attente l'emporte sur une incrémentale. Chaque promesse se
 * résout quand l'exécution qui la couvre est terminée ; les erreurs restent à
 * `run`, qui les consigne dans son rapport.
 */
export function createSyncQueue(run: (mode: SyncMode) => Promise<void>): (mode: SyncMode) => Promise<void> {
  let running = false;
  let queued: SyncMode | null = null;
  let queuedWaiters: (() => void)[] = [];

  async function loop(first: SyncMode, firstWaiters: (() => void)[]): Promise<void> {
    running = true;
    let mode: SyncMode | null = first;
    let waiters = firstWaiters;
    while (mode) {
      try {
        await run(mode);
      } catch {
        /* consigné par `run` ; la file continue */
      }
      waiters.forEach((resolve) => resolve());
      mode = queued;
      waiters = queuedWaiters;
      queued = null;
      queuedWaiters = [];
    }
    running = false;
  }

  return (mode) =>
    new Promise<void>((resolve) => {
      if (!running) {
        void loop(mode, [resolve]);
        return;
      }
      queued = queued === 'full' || mode === 'full' ? 'full' : 'incremental';
      queuedWaiters.push(resolve);
    });
}
