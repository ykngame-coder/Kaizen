import type { SetEntry } from '@supotsu/core';
import { warmupRamp, type WarmupSet } from '@supotsu/engines';

/**
 * Logique du runner, hors composants (Lot 2a). Tout ce qui décide « où en
 * est-on » vit ici pour être testable : les écrans ne font que rendre.
 */

export interface RunProgress {
  /** Série à faire maintenant — absente quand tout est terminé. */
  activeSetId?: string;
  /** Exercice de la série active. */
  activeExerciseId?: string;
  /** Rang de la série active parmi les séries de travail de son exercice (0-based). */
  activeSetIndexInExercise: number;
  /** Nombre de séries de travail de l'exercice actif. */
  workingSetsInExercise: number;
  /** Premier exercice différent après l'actif, pour l'aperçu « Prochain ». */
  nextExerciseId?: string;
  doneCount: number;
  totalCount: number;
  isFinished: boolean;
}

/**
 * Reconstruit la progression à partir des seules séries. C'est ce qui permet
 * de reprendre une séance même si l'état local a disparu : `completedAt` en
 * base est la source de vérité, le store local n'est qu'un confort.
 */
export function buildRunProgress(sets: SetEntry[]): RunProgress {
  const ordered = [...sets].sort((a, b) => a.order - b.order);
  const active = ordered.find((s) => !s.completedAt);
  const doneCount = ordered.filter((s) => s.completedAt).length;

  const activeExerciseId = active?.exerciseId;
  const working = ordered.filter((s) => s.exerciseId === activeExerciseId && !s.isWarmup);

  return {
    activeSetId: active?.id,
    activeExerciseId,
    activeSetIndexInExercise: active ? Math.max(0, working.findIndex((s) => s.id === active.id)) : 0,
    workingSetsInExercise: working.length,
    nextExerciseId: active
      ? ordered.slice(ordered.indexOf(active) + 1).find((s) => s.exerciseId !== activeExerciseId)?.exerciseId
      : undefined,
    doneCount,
    totalCount: ordered.length,
    isFinished: active === undefined && ordered.length > 0,
  };
}

/**
 * Secondes de repos restantes, calculées par différence d'horloge plutôt que
 * par décrément : iOS suspend les timers en arrière-plan, un compteur
 * incrémenté prendrait du retard sans le signaler.
 */
export function restRemainingSec(restEndsAtMs: number | undefined, nowMs: number): number {
  if (restEndsAtMs === undefined) return 0;
  return Math.max(0, Math.ceil((restEndsAtMs - nowMs) / 1000));
}

export interface WarmupProposalInput {
  workKg?: number;
  workReps?: number;
  barWeightKg: number;
}

/**
 * Rampe d'échauffement retenue pour une série de travail : le moteur ignore le
 * matériel, c'est ici qu'on écarte les marches plus légères que la barre à vide
 * (les charger est impossible).
 */
export function warmupProposal({ workKg, workReps, barWeightKg }: WarmupProposalInput): WarmupSet[] {
  if (!workKg || workKg <= 0) return [];
  return warmupRamp(workKg, workReps ?? 1).filter((w) => w.weightKg >= barWeightKg);
}

export type AdherenceTone = 'success' | 'neutral' | 'warning';

/**
 * Tonalité du badge d'adhésion. Un dépassement est un succès : faire plus que
 * prévu n'est pas un échec.
 */
export function adherenceTone(ratio: number): AdherenceTone {
  if (ratio >= 0.9) return 'success';
  if (ratio >= 0.7) return 'neutral';
  return 'warning';
}
