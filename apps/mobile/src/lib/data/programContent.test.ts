import { describe, expect, it } from 'vitest';
import { programSessionTemplates } from './programContent';

const session = (id: string, programId: string, order: number, title: string, notes: string | null = null) => ({
  id,
  program_id: programId,
  order,
  title,
  notes,
});

const exercise = (sessionId: string, exerciseId: string, order: number, sets = 3, reps = 10) => ({
  id: `${sessionId}-${exerciseId}`,
  session_id: sessionId,
  exercise_id: exerciseId,
  order,
  sets,
  reps,
});

describe('programSessionTemplates', () => {
  it('range les séances et leurs exercices dans l ordre voulu', () => {
    const out = programSessionTemplates(
      'p1',
      [session('s2', 'p1', 1, 'Jour 2'), session('s1', 'p1', 0, 'Jour 1')],
      [exercise('s1', 'squat', 1, 4, 8), exercise('s1', 'dips', 0, 3, 12), exercise('s2', 'rowing', 0)],
    );
    expect(out.map((s) => s.title)).toEqual(['Jour 1', 'Jour 2']);
    expect(out[0]!.exercises).toEqual([
      { exerciseId: 'dips', sets: 3, reps: 12 },
      { exerciseId: 'squat', sets: 4, reps: 8 },
    ]);
  });

  it('ne mélange pas les séances de deux programmes', () => {
    const out = programSessionTemplates(
      'p1',
      [session('s1', 'p1', 0, 'À moi'), session('s9', 'p2', 0, 'À l autre')],
      [exercise('s9', 'squat', 0)],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('À moi');
  });

  it('garde une séance sans exercice — une sortie course n en a pas', () => {
    const out = programSessionTemplates('p1', [session('s1', 'p1', 0, '5 km souple', '30 min en aisance respiratoire')], []);
    expect(out).toEqual([{ title: '5 km souple', notes: '30 min en aisance respiratoire', exercises: undefined }]);
  });

  it('rend une liste vide quand le programme n a pas encore de contenu', () => {
    expect(programSessionTemplates('p1', [], [])).toEqual([]);
  });
});
