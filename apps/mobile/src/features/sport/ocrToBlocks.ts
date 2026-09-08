import { newSlotId, type BlockDraft, type SetDraft } from '@/features/training/sessionBuilder';

/** The shape OcrImportScreen's review step produces, narrowed to what a block needs. */
export interface OcrExerciseDraft {
  exerciseId?: string;
  sets: { reps: string; weight: string }[];
  supersetGroup?: number;
}

/**
 * The reviewed OCR lines, as a single strength block the shared session builder
 * can edit.
 *
 * A screenshot has no notion of blocks, so everything lands in one — the user
 * then splits it, changes its format or adds a Tabata in the builder, which is
 * exactly what the import could not do while it carried its own editor.
 */
export function ocrDraftsToBlock(drafts: OcrExerciseDraft[]): BlockDraft {
  const order: string[] = [];
  const selected: Record<string, SetDraft> = {};
  const supersetGroups: Record<string, number> = {};

  for (const d of drafts) {
    // Une ligne non rattachée au catalogue n'a pas d'exercice à porter.
    if (!d.exerciseId) continue;
    for (const s of d.sets) {
      // Une série entièrement vide est du bruit de lecture, pas une série.
      if (!s.reps.trim() && !s.weight.trim()) continue;
      const slotId = newSlotId(d.exerciseId);
      order.push(slotId);
      selected[slotId] = { exerciseId: d.exerciseId, reps: s.reps.trim(), weight: s.weight.trim(), rest: '' };
      if (d.supersetGroup != null) supersetGroups[slotId] = d.supersetGroup;
    }
  }

  return { format: 'strength', timeCapSec: '12', restSec: '', targetRounds: '', order, selected, supersetGroups };
}
