import { describe, expect, it } from 'vitest';
import type { UserSessionBlock, UserSessionExercise } from '@supotsu/core';
import { sessionToWorkoutBlocks } from './sessionWorkout';

const block = (id: string, order: number, over: Partial<UserSessionBlock> = {}): UserSessionBlock => ({
  id,
  sessionId: 's1',
  order,
  format: 'strength',
  ...over,
});

const exercise = (over: Partial<UserSessionExercise> & { exerciseId: string }): UserSessionExercise => ({
  id: `e-${over.exerciseId}-${over.order ?? 0}`,
  sessionId: 's1',
  order: 0,
  ...over,
});

describe('sessionToWorkoutBlocks', () => {
  it('rend à chaque bloc ses exercices, avec durée, charge et distance', () => {
    const out = sessionToWorkoutBlocks(
      [block('b1', 0), block('b2', 1, { format: 'amrap', timeCapSec: 120 })],
      [
        exercise({ exerciseId: 'Running_Treadmill', blockId: 'b1', order: 0, durationSec: 300 }),
        exercise({ exerciseId: 'Sled_Push', blockId: 'b2', order: 0, reps: 10, weightKg: 150 }),
        exercise({ exerciseId: 'Running_Treadmill', blockId: 'b2', order: 1, distanceM: 250 }),
      ],
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.sets).toEqual([{ exerciseId: 'Running_Treadmill', order: 0, reps: undefined, weightKg: undefined, durationSec: 300, distanceM: undefined, restSec: undefined }]);
    expect(out[1]).toMatchObject({ format: 'amrap', timeCapSec: 120 });
    expect(out[1]!.sets.map((s) => s.distanceM)).toEqual([undefined, 250]);
  });

  it('donne un bloc à une séance qui n en a pas — sans bloc, le lecteur refuse de démarrer', () => {
    const out = sessionToWorkoutBlocks([], [exercise({ exerciseId: 'ex-burpee', order: 0, reps: 10 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.format).toBe('strength');
    expect(out[0]!.sets[0]).toMatchObject({ exerciseId: 'ex-burpee', reps: 10 });
  });

  it('laisse un bloc vide plutôt que d y verser les exercices d un autre', () => {
    const out = sessionToWorkoutBlocks(
      [block('b1', 0), block('b2', 1)],
      [exercise({ exerciseId: 'ex-burpee', blockId: 'b1', order: 0 })],
    );
    expect(out[1]!.sets).toEqual([]);
  });
});
