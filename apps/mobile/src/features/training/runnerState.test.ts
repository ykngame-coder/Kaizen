import { describe, expect, it } from 'vitest';
import type { SetEntry } from '@supotsu/core';
import {
  adherenceTone,
  buildRunProgress,
  cadenceSecPerRound,
  elapsedSecFrom,
  emomMinuteTask,
  restRemainingSec,
  warmupProposal,
} from './runnerState';

const DONE = '2026-09-05T10:00:00.000Z';
const s = (over: Partial<SetEntry>): SetEntry => ({
  id: 'id',
  workoutId: 'w1',
  exerciseId: 'bench',
  order: 0,
  ...over,
});

describe('buildRunProgress', () => {
  it('désigne la première série non faite comme active', () => {
    const sets = [
      s({ id: 'a', order: 0, completedAt: DONE }),
      s({ id: 'b', order: 1 }),
      s({ id: 'c', order: 2 }),
    ];
    const p = buildRunProgress(sets);
    expect(p.activeSetId).toBe('b');
    expect(p.doneCount).toBe(1);
    expect(p.totalCount).toBe(3);
  });

  it('trie par ordre avant de décider', () => {
    const sets = [s({ id: 'b', order: 1 }), s({ id: 'a', order: 0, completedAt: DONE })];
    expect(buildRunProgress(sets).activeSetId).toBe('b');
  });

  it('nomme le prochain exercice différent', () => {
    const sets = [
      s({ id: 'a', order: 0, exerciseId: 'bench' }),
      s({ id: 'b', order: 1, exerciseId: 'bench' }),
      s({ id: 'c', order: 2, exerciseId: 'row' }),
    ];
    expect(buildRunProgress(sets).nextExerciseId).toBe('row');
  });

  it('ne renvoie aucun prochain exercice sur le dernier', () => {
    const sets = [s({ id: 'a', order: 0, exerciseId: 'bench' })];
    expect(buildRunProgress(sets).nextExerciseId).toBeUndefined();
  });

  it('signale une séance terminée', () => {
    const sets = [s({ id: 'a', order: 0, completedAt: DONE })];
    const p = buildRunProgress(sets);
    expect(p.activeSetId).toBeUndefined();
    expect(p.isFinished).toBe(true);
  });

  it('compte les séries de l’exercice actif hors échauffement', () => {
    const sets = [
      s({ id: 'w', order: 0, isWarmup: true, completedAt: DONE }),
      s({ id: 'a', order: 1, completedAt: DONE }),
      s({ id: 'b', order: 2 }),
    ];
    const p = buildRunProgress(sets);
    expect(p.activeSetIndexInExercise).toBe(1);
    expect(p.workingSetsInExercise).toBe(2);
  });
});

describe('restRemainingSec', () => {
  it('compte le temps restant jusqu’à l’instant de fin', () => {
    expect(restRemainingSec(10_000, 4_000)).toBe(6);
  });

  it('rend zéro une fois l’échéance passée, même longtemps après', () => {
    // Retour d'arrière-plan bien après la fin du repos : jamais de négatif.
    expect(restRemainingSec(10_000, 999_000)).toBe(0);
  });

  it('rend zéro sans repos en cours', () => {
    expect(restRemainingSec(undefined, 4_000)).toBe(0);
  });
});

describe('warmupProposal', () => {
  it('propose une rampe sur une première série de travail chargée', () => {
    const ramp = warmupProposal({ workKg: 100, workReps: 8, barWeightKg: 20 });
    expect(ramp.length).toBeGreaterThan(0);
    expect(ramp.every((w) => w.weightKg >= 20)).toBe(true);
  });

  it('écarte les marches plus légères que la barre', () => {
    // 40 % de 40 kg = 16 kg, sous une barre de 20 kg : marche retirée.
    const ramp = warmupProposal({ workKg: 40, workReps: 8, barWeightKg: 20 });
    expect(ramp.every((w) => w.weightKg >= 20)).toBe(true);
    expect(ramp.length).toBeLessThan(3);
  });

  it('ne propose rien sans charge de travail', () => {
    expect(warmupProposal({ workKg: undefined, workReps: 8, barWeightKg: 20 })).toEqual([]);
  });
});

describe('adherenceTone', () => {
  it('classe aux bornes 90 % et 70 %', () => {
    expect(adherenceTone(0.9)).toBe('success');
    expect(adherenceTone(0.89)).toBe('neutral');
    expect(adherenceTone(0.7)).toBe('neutral');
    expect(adherenceTone(0.69)).toBe('warning');
  });

  it('traite un dépassement comme un succès', () => {
    expect(adherenceTone(1.2)).toBe('success');
  });
});

describe('elapsedSecFrom', () => {
  it('compte depuis le démarrage', () => {
    expect(elapsedSecFrom({ startedAtMs: 1_000, pausedTotalMs: 0 }, 6_000)).toBe(5);
  });

  it('retranche le temps déjà mis en pause', () => {
    expect(elapsedSecFrom({ startedAtMs: 1_000, pausedTotalMs: 2_000 }, 6_000)).toBe(3);
  });

  it('se fige pendant une pause en cours', () => {
    const state = { startedAtMs: 1_000, pausedTotalMs: 0, pausedAtMs: 4_000 };
    // L'horloge murale avance, l'écoulé non.
    expect(elapsedSecFrom(state, 6_000)).toBe(3);
    expect(elapsedSecFrom(state, 60_000)).toBe(3);
  });

  it('ne renvoie jamais de valeur négative', () => {
    expect(elapsedSecFrom({ startedAtMs: 9_000, pausedTotalMs: 0 }, 1_000)).toBe(0);
  });
});

describe('cadenceSecPerRound', () => {
  it('moyenne le temps par tour', () => {
    expect(cadenceSecPerRound(180, 3)).toBe(60);
  });

  it('ne renvoie rien sans tour terminé', () => {
    expect(cadenceSecPerRound(180, 0)).toBeUndefined();
  });
});

describe('emomMinuteTask', () => {
  it('répète l’unique mouvement à chaque minute', () => {
    const sets = [s({ id: 'a', order: 0 })];
    expect(emomMinuteTask(sets, 1)?.id).toBe('a');
    expect(emomMinuteTask(sets, 7)?.id).toBe('a');
  });

  it('alterne les mouvements minute après minute', () => {
    const sets = [s({ id: 'a', order: 0 }), s({ id: 'b', order: 1 })];
    expect(emomMinuteTask(sets, 1)?.id).toBe('a');
    expect(emomMinuteTask(sets, 2)?.id).toBe('b');
    expect(emomMinuteTask(sets, 3)?.id).toBe('a');
  });

  it('ne renvoie rien sans mouvement', () => {
    expect(emomMinuteTask([], 1)).toBeUndefined();
  });
});
