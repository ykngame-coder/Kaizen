import type { BlockFormat, SetEntry, UserSessionBlock, UserSessionExercise } from '@supotsu/core';

/** Un bloc prêt à être enregistré, tel que l'attendent `addPlannedWorkout` et `addCircuitWorkout`. */
export interface SessionWorkoutBlock {
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
  sets: Omit<SetEntry, 'id' | 'workoutId' | 'blockId'>[];
}

type WorkoutBlocks = SessionWorkoutBlock[];

/**
 * Une séance de bibliothèque transformée en séance à faire.
 *
 * Deux chemins en avaient besoin — lancer une séance depuis la bibliothèque, et
 * s'inscrire à un programme de coach, qui en planifie dix d'un coup. La règle
 * qui compte est la dernière : une séance sans bloc enregistré (bibliothèque
 * d'avant le support des blocs) devient UN bloc « strength », jamais zéro —
 * sans bloc, le lecteur de séance refuse de démarrer.
 */
export function sessionToWorkoutBlocks(
  blocks: UserSessionBlock[],
  exercises: UserSessionExercise[],
): WorkoutBlocks {
  const setOf = (e: UserSessionExercise, fallbackOrder: number): WorkoutBlocks[number]['sets'][number] => ({
    exerciseId: e.exerciseId,
    order: e.order ?? fallbackOrder,
    reps: e.reps,
    weightKg: e.weightKg,
    durationSec: e.durationSec,
    distanceM: e.distanceM,
    restSec: e.restSec,
  });

  if (blocks.length === 0) {
    return [{ format: 'strength', sets: exercises.map(setOf) }];
  }

  return blocks.map((b) => ({
    format: b.format,
    timeCapSec: b.timeCapSec,
    targetRounds: b.targetRounds,
    sets: exercises.filter((e) => e.blockId === b.id).map(setOf),
  }));
}
