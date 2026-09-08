import { describe, expect, it } from 'vitest';
import { ocrDraftsToBlock } from './ocrToBlocks';

const order = (b: ReturnType<typeof ocrDraftsToBlock>) =>
  b.order.map((slot) => [b.selected[slot]!.exerciseId, b.selected[slot]!.reps, b.selected[slot]!.weight]);

describe('ocrDraftsToBlock', () => {
  it('donne une série par ligne lue, dans l ordre', () => {
    const b = ocrDraftsToBlock([
      { exerciseId: 'squat', sets: [{ reps: '5', weight: '60' }, { reps: '5', weight: '65' }] },
      { exerciseId: 'bench', sets: [{ reps: '8', weight: '40' }] },
    ]);
    expect(order(b)).toEqual([
      ['squat', '5', '60'],
      ['squat', '5', '65'],
      ['bench', '8', '40'],
    ]);
  });

  it('donne des slots distincts au même exercice répété', () => {
    const b = ocrDraftsToBlock([{ exerciseId: 'squat', sets: [{ reps: '5', weight: '60' }, { reps: '3', weight: '80' }] }]);
    expect(new Set(b.order).size).toBe(2);
  });

  it('ignore une série entièrement vide, qui est du bruit de lecture', () => {
    const b = ocrDraftsToBlock([
      { exerciseId: 'squat', sets: [{ reps: '', weight: '' }, { reps: '  ', weight: ' ' }, { reps: '5', weight: '' }] },
    ]);
    expect(b.order).toHaveLength(1);
    expect(order(b)).toEqual([['squat', '5', '']]);
  });

  it('ignore une ligne non rattachée au catalogue', () => {
    const b = ocrDraftsToBlock([
      { sets: [{ reps: '5', weight: '60' }] },
      { exerciseId: 'bench', sets: [{ reps: '8', weight: '40' }] },
    ]);
    expect(order(b)).toEqual([['bench', '8', '40']]);
  });

  it('reporte les groupes de superset sur chaque série concernée', () => {
    const b = ocrDraftsToBlock([
      { exerciseId: 'squat', sets: [{ reps: '5', weight: '60' }, { reps: '5', weight: '60' }], supersetGroup: 1 },
      { exerciseId: 'bench', sets: [{ reps: '8', weight: '40' }] },
    ]);
    expect(b.order.map((s) => b.supersetGroups[s])).toEqual([1, 1, undefined]);
  });

  it('rend un bloc musculation vide plutôt que rien quand tout est ignoré', () => {
    const b = ocrDraftsToBlock([{ sets: [{ reps: '', weight: '' }] }]);
    expect(b.format).toBe('strength');
    expect(b.order).toEqual([]);
  });
});
