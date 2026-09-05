import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import { computePlanAdherence } from './adherence';

const set = (over: Partial<SetEntry>): SetEntry => ({
  id: 'sx',
  workoutId: 'w1',
  exerciseId: 'squat',
  order: 0,
  completedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

describe('computePlanAdherence', () => {
  it('rend 100 % quand tout est réalisé comme prévu', () => {
    const sets = [
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 8, weightKg: 60 }),
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 8, weightKg: 60 }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 1, comparedSets: 2, metOrExceeded: 2 });
  });

  it('compte une série non validée comme un réalisé nul', () => {
    const sets = [
      set({ plannedReps: 10, plannedWeightKg: 50, reps: 10, weightKg: 50 }),
      // Pré-remplie par le runner mais jamais cochée : ne compte pas comme faite.
      set({ plannedReps: 10, plannedWeightKg: 50, reps: 10, weightKg: 50, completedAt: undefined }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 0.5, comparedSets: 2, metOrExceeded: 1 });
  });

  it('capte une baisse de charge à reps identiques', () => {
    // Les reps seules diraient 100 % : c'est précisément ce que le tonnage évite.
    const sets = [set({ plannedReps: 8, plannedWeightKg: 62.5, reps: 8, weightKg: 50 })];
    expect(computePlanAdherence(sets)!.ratio).toBeCloseTo(0.8, 5);
  });

  it('exclut les séries d’échauffement des deux côtés', () => {
    const sets = [
      set({ isWarmup: true, plannedReps: 8, plannedWeightKg: 25, reps: 8, weightKg: 25 }),
      set({ plannedReps: 8, plannedWeightKg: 60, reps: 4, weightKg: 60 }),
    ];
    expect(computePlanAdherence(sets)).toEqual({ ratio: 0.5, comparedSets: 1, metOrExceeded: 0 });
  });

  it('ignore les séries sans plan et retourne undefined s’il n’en reste aucune', () => {
    expect(computePlanAdherence([set({ reps: 8, weightKg: 60 })])).toBeUndefined();
    expect(computePlanAdherence([])).toBeUndefined();
  });

  it('borne le dépassement à 200 %', () => {
    const sets = [set({ plannedReps: 5, plannedWeightKg: 20, reps: 40, weightKg: 20 })];
    expect(computePlanAdherence(sets)!.ratio).toBe(2);
  });

  it('compte les reps quand il n’y a pas de charge', () => {
    const sets = [set({ plannedReps: 20, reps: 15 })];
    expect(computePlanAdherence(sets)!.ratio).toBeCloseTo(0.75, 5);
  });
});
