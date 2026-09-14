import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useImportHealth } from '@/lib/data/queries';
import { nativeHealthSource } from './healthKitClient';
import { runHealthSync, type SyncMode, type SyncPayload, type SyncReport } from './healthSyncEngine';
import { createSyncQueue } from './healthSyncQueue';
import { createAnchorStore, saveSyncReport } from './healthSyncStore';

/**
 * Point d'entrée unique de la synchro Apple Santé : ouverture de l'app,
 * arrivée de données, bouton de l'Accueil, tirer-pour-rafraîchir, écran
 * Appareils. Tout passe par UNE file au niveau du module — c'est ce qui
 * garantit qu'une seule synchro tourne à la fois, quel que soit le nombre
 * d'écrans ou d'abonnements qui la demandent.
 *
 * Les dépendances (compte, enregistrement) viennent des hooks React ; la file,
 * elle, vit hors de React. Le dernier composant monté fournit les siennes.
 */
let deps: { userId: string; persist: (payload: SyncPayload) => Promise<void> } | null = null;

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const queue = createSyncQueue(async (mode) => {
  const current = deps;
  if (!current) return;
  const startedAt = new Date();
  let report: SyncReport;
  try {
    report = await runHealthSync(
      {
        source: nativeHealthSource,
        anchors: createAnchorStore(current.userId, nativeHealthSource.types),
        persist: current.persist,
        now: () => new Date(),
      },
      mode,
    );
  } catch (e) {
    report = {
      mode,
      reason: 'requested',
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      perType: {},
      anchorsVia: {},
      error: errorText(e),
    };
  }
  await saveSyncReport(current.userId, report).catch(() => undefined);
});

/**
 * Rend la fonction qui demande une synchro. La promesse se résout quand la
 * synchro qui couvre la demande est terminée — le rapport est alors lisible
 * avec `loadSyncReport`.
 */
export function useHealthSync(): (mode: SyncMode) => Promise<void> {
  const { user } = useAuth();
  const importHealth = useImportHealth();
  const { mutateAsync } = importHealth;

  useEffect(() => {
    if (!user) return;
    deps = {
      userId: user.id,
      persist: async (p) => {
        await mutateAsync({ ...p, records: [], workouts: [] });
      },
    };
  }, [user, mutateAsync]);

  return (mode) => {
    // L'effet n'a peut-être pas encore tourné (premier rendu, changement de
    // compte) : une synchro ne doit jamais partir sous le compte précédent.
    if (user && deps?.userId !== user.id) {
      deps = { userId: user.id, persist: async (p) => void (await mutateAsync({ ...p, records: [], workouts: [] })) };
    }
    return queue(mode);
  };
}
