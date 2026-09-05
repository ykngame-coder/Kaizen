import { secureStorage } from '@/lib/secure-storage';

/**
 * État d'écran d'une séance en cours (Lot 2a). Volontairement limité aux
 * minuteurs : ce qui a réellement été fait vit en base (`completedAt` sur
 * chaque série), pas ici. Perdre ce store ne perd donc jamais une performance,
 * seulement le chrono — la reprise se reconstruit depuis les séries.
 */
export interface RunState {
  /** Instant de démarrage du chrono de séance. */
  startedAtMs: number;
  /** Échéance du repos en cours, absente si aucun repos ne tourne. */
  restEndsAtMs?: number;
  /** Bloc actif, pour les séances multi-blocs. */
  activeBlockIndex: number;
}

const key = (workoutId: string): string => `supotsu.runState.${workoutId}`;

export async function loadRunState(workoutId: string): Promise<RunState | null> {
  const raw = await secureStorage.getItem(key(workoutId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RunState>;
    if (typeof parsed.startedAtMs !== 'number') return null;
    return {
      startedAtMs: parsed.startedAtMs,
      restEndsAtMs: typeof parsed.restEndsAtMs === 'number' ? parsed.restEndsAtMs : undefined,
      activeBlockIndex: typeof parsed.activeBlockIndex === 'number' ? parsed.activeBlockIndex : 0,
    };
  } catch {
    // État corrompu : on repart d'un chrono neuf plutôt que de bloquer la séance.
    return null;
  }
}

export async function saveRunState(workoutId: string, state: RunState): Promise<void> {
  await secureStorage.setItem(key(workoutId), JSON.stringify(state));
}

export async function clearRunState(workoutId: string): Promise<void> {
  await secureStorage.removeItem(key(workoutId));
}
