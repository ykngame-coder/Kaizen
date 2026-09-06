import { describe, expect, it } from 'vitest';
import type { UserSessionBlock, UserSessionExercise } from '@supotsu/core';
import { blocksToSessionInput } from './sessionBuilder';
import { sessionToBlockDrafts } from './sessionToDrafts';

const block = (o: Partial<UserSessionBlock> & { id: string; order: number }): UserSessionBlock => ({
  sessionId: 's1',
  format: 'strength',
  ...o,
});

const ex = (o: Partial<UserSessionExercise> & { id: string; order: number; exerciseId: string }): UserSessionExercise => ({
  sessionId: 's1',
  ...o,
});

/** Ordre d'exécution d'un bloc, en ids d'exercice — les slots sont synthétiques. */
const exerciseOrder = (b: { order: string[]; selected: Record<string, { exerciseId: string }> }): string[] =>
  b.order.map((slotId) => b.selected[slotId]!.exerciseId);

describe('sessionToBlockDrafts', () => {
  it('restitue les blocs dans leur ordre, exercices compris', () => {
    const drafts = sessionToBlockDrafts(
      [block({ id: 'b2', order: 1, format: 'amrap', timeCapSec: 720 }), block({ id: 'b1', order: 0 })],
      [
        ex({ id: 'e2', order: 1, exerciseId: 'squat', blockId: 'b1' }),
        ex({ id: 'e1', order: 0, exerciseId: 'bench', blockId: 'b1' }),
        ex({ id: 'e3', order: 0, exerciseId: 'burpee', blockId: 'b2' }),
      ],
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.format).toBe('strength');
    expect(exerciseOrder(drafts[0]!)).toEqual(['bench', 'squat']);
    expect(drafts[1]!.format).toBe('amrap');
    expect(exerciseOrder(drafts[1]!)).toEqual(['burpee']);
  });

  it('reconvertit le temps en minutes pour AMRAP et For Time, en secondes pour EMOM', () => {
    const drafts = sessionToBlockDrafts(
      [
        block({ id: 'b1', order: 0, format: 'amrap', timeCapSec: 720 }),
        block({ id: 'b2', order: 1, format: 'for_time', timeCapSec: 600 }),
        block({ id: 'b3', order: 2, format: 'emom', timeCapSec: 90 }),
      ],
      [
        ex({ id: 'e1', order: 0, exerciseId: 'a', blockId: 'b1' }),
        ex({ id: 'e2', order: 0, exerciseId: 'b', blockId: 'b2' }),
        ex({ id: 'e3', order: 0, exerciseId: 'c', blockId: 'b3' }),
      ],
    );
    expect(drafts.map((d) => d.timeCapSec)).toEqual(['12', '10', '90']);
  });

  it('fait l aller-retour sans rien perdre', () => {
    const blocks = [
      block({ id: 'b1', order: 0, format: 'amrap', timeCapSec: 720 }),
      block({ id: 'b2', order: 1, format: 'strength', targetRounds: 3 }),
    ];
    const exercises = [
      ex({ id: 'e1', order: 0, exerciseId: 'burpee', blockId: 'b1', reps: 10 }),
      ex({ id: 'e2', order: 0, exerciseId: 'squat', blockId: 'b2', reps: 5, weightKg: 60, restSec: 90 }),
    ];
    const round = blocksToSessionInput(sessionToBlockDrafts(blocks, exercises));
    expect(round).toEqual([
      { format: 'amrap', timeCapSec: 720, targetRounds: undefined, exercises: [{ exerciseId: 'burpee', order: 0, reps: 10, weightKg: undefined, restSec: undefined }] },
      { format: 'strength', timeCapSec: undefined, targetRounds: 3, exercises: [{ exerciseId: 'squat', order: 0, reps: 5, weightKg: 60, restSec: 90 }] },
    ]);
  });

  it('rattrape une séance ancienne « à plat » : sans blocs, les exercices ne doivent pas disparaître', () => {
    const drafts = sessionToBlockDrafts(
      [],
      [
        ex({ id: 'e2', order: 1, exerciseId: 'squat' }),
        ex({ id: 'e1', order: 0, exerciseId: 'bench' }),
      ],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.format).toBe('strength');
    expect(exerciseOrder(drafts[0]!)).toEqual(['bench', 'squat']);
  });

  it('garde deux slots distincts quand le même exercice revient dans un bloc', () => {
    const drafts = sessionToBlockDrafts(
      [block({ id: 'b1', order: 0 })],
      [
        ex({ id: 'e1', order: 0, exerciseId: 'squat', reps: 5, blockId: 'b1' }),
        ex({ id: 'e2', order: 1, exerciseId: 'squat', reps: 12, blockId: 'b1' }),
      ],
    );
    const b = drafts[0]!;
    expect(b.order).toHaveLength(2);
    expect(new Set(b.order).size).toBe(2);
    expect(exerciseOrder(b)).toEqual(['squat', 'squat']);
    expect(b.order.map((s) => b.selected[s]!.reps)).toEqual(['5', '12']);
  });

  it('rend les valeurs absentes comme des champs vides, pas comme « undefined »', () => {
    const drafts = sessionToBlockDrafts(
      [block({ id: 'b1', order: 0 })],
      [ex({ id: 'e1', order: 0, exerciseId: 'squat', blockId: 'b1' })],
    );
    const slot = drafts[0]!.selected[drafts[0]!.order[0]!]!;
    expect(slot).toMatchObject({ exerciseId: 'squat', reps: '', weight: '', rest: '' });
    expect(drafts[0]!.targetRounds).toBe('');
  });

  it('rend un bloc vide pour une séance sans rien, plutôt qu une liste vide', () => {
    const drafts = sessionToBlockDrafts([], []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.order).toEqual([]);
  });

  it('ignore un bloc dont tous les exercices ont disparu', () => {
    const drafts = sessionToBlockDrafts(
      [block({ id: 'b1', order: 0 }), block({ id: 'b2', order: 1, format: 'amrap', timeCapSec: 300 })],
      [ex({ id: 'e1', order: 0, exerciseId: 'squat', blockId: 'b1' })],
    );
    expect(drafts).toHaveLength(1);
    expect(exerciseOrder(drafts[0]!)).toEqual(['squat']);
  });
});
