import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { suggestProgression } from './training';

const set = (order: number, weightKg?: number, reps?: number): SetEntry => ({
  id: `s${order}`,
  workoutId: 'w1',
  exerciseId: 'bench',
  order,
  weightKg,
  reps,
});

describe('suggestProgression', () => {
  it('bumps the load once the top of the range is reached', () => {
    const s = suggestProgression([set(0, 60, 12)], { repRange: [8, 12], incrementKg: 2.5 })!;
    expect(s.weightKg).toBe(62.5);
    expect(s.reps).toBe(8);
  });

  it('adds a rep at the same load below the range top', () => {
    const s = suggestProgression([set(0, 60, 9)], { repRange: [8, 12] })!;
    expect(s.weightKg).toBe(60);
    expect(s.reps).toBe(10);
  });

  it('uses the heaviest working set of the session', () => {
    const s = suggestProgression([set(0, 50, 12), set(1, 60, 12), set(2, 55, 12)])!;
    expect(s.weightKg).toBe(62.5);
  });

  it('progresses reps only when no load is recorded', () => {
    const s = suggestProgression([set(0, undefined, 15)])!;
    expect(s.weightKg).toBeUndefined();
    expect(s.reps).toBe(16);
  });

  it('returns undefined with nothing to progress from', () => {
    expect(suggestProgression([])).toBeUndefined();
    expect(suggestProgression([set(0, undefined, undefined)])).toBeUndefined();
  });
});

describe('suggestProgression — rationale structurée', () => {
  it('addRep quand aucune charge n’est enregistrée', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'pushup', order: 0, reps: 12 },
    ]);
    expect(s?.rationale).toEqual({ kind: 'addRep', reps: 13 });
  });

  it('increaseLoad une fois le haut de la fourchette atteint', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'squat', order: 0, reps: 12, weightKg: 60 },
    ]);
    expect(s?.rationale).toEqual({
      kind: 'increaseLoad',
      fromWeightKg: 60,
      toWeightKg: 62.5,
      highReps: 12,
      lowReps: 8,
    });
  });

  it('addRepSameLoad tant que la fourchette n’est pas atteinte', () => {
    const s = suggestProgression([
      { id: 's1', workoutId: 'w', exerciseId: 'squat', order: 0, reps: 9, weightKg: 60 },
    ]);
    expect(s?.rationale).toEqual({ kind: 'addRepSameLoad', reps: 10, weightKg: 60 });
  });
});
