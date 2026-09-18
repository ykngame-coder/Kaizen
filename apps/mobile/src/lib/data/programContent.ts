import type { ProgramSessionTemplate } from '@supotsu/core';
import type { ProgramSessionExerciseRow, ProgramSessionRow } from '@supotsu/database';

/**
 * Le contenu d'un programme de coach, recollé depuis ses lignes.
 *
 * Il vivait en dur dans `packages/shared/src/programs.ts` : publier ou
 * corriger un programme demandait un build et une revue Apple. Le contenu est
 * désormais une donnée ; cette fonction est la seule à savoir l'assembler, et
 * elle se teste sans base.
 */
export function programSessionTemplates(
  programId: string,
  sessions: ProgramSessionRow[],
  exercises: ProgramSessionExerciseRow[],
): ProgramSessionTemplate[] {
  const mine = sessions.filter((s) => s.program_id === programId).sort((a, b) => a.order - b.order);
  const bySession = new Map<string, ProgramSessionExerciseRow[]>();
  for (const e of exercises) {
    const list = bySession.get(e.session_id) ?? [];
    list.push(e);
    bySession.set(e.session_id, list);
  }

  return mine.map((s) => {
    const own = (bySession.get(s.id) ?? []).sort((a, b) => a.order - b.order);
    return {
      title: s.title,
      notes: s.notes ?? undefined,
      // Une séance de course n'a pas d'exercices : ses consignes tiennent dans
      // les notes, et une liste vide se lirait comme « séance sans contenu ».
      exercises: own.length > 0 ? own.map((e) => ({ exerciseId: e.exercise_id, sets: e.sets, reps: e.reps })) : undefined,
    };
  });
}
