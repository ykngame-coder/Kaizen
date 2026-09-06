import type { UserSessionBlock, UserSessionExercise } from '@supotsu/core';
import { defaultTimeCapForFormat, emptyBlock, newSlotId, type BlockDraft, type SetDraft } from './sessionBuilder';

const str = (n: number | undefined): string => (n == null ? '' : String(n));

/**
 * Inverse de `blocksToSessionInput` : le champ « temps » ne veut pas dire la
 * même chose selon le format. AMRAP et For Time sont enregistrés en secondes
 * depuis des minutes saisies, EMOM en secondes telles quelles — restituer
 * bêtement la valeur brute afficherait « 720 » là où l'utilisateur avait tapé
 * « 12 ».
 */
function timeCapDraft(block: UserSessionBlock): string {
  if (block.timeCapSec == null) return defaultTimeCapForFormat(block.format);
  if (block.format === 'amrap' || block.format === 'for_time') return String(Math.round(block.timeCapSec / 60));
  if (block.format === 'emom') return String(block.timeCapSec);
  return defaultTimeCapForFormat(block.format);
}

function draftFor(block: UserSessionBlock | null, exercises: UserSessionExercise[]): BlockDraft {
  const order: string[] = [];
  const selected: Record<string, SetDraft> = {};
  for (const e of [...exercises].sort((a, b) => a.order - b.order)) {
    // Un slot neuf par exercice : la clé est synthétique, sinon le même
    // exercice répété dans un bloc s'écraserait lui-même.
    const slotId = newSlotId(e.exerciseId);
    order.push(slotId);
    selected[slotId] = { exerciseId: e.exerciseId, reps: str(e.reps), weight: str(e.weightKg), rest: str(e.restSec) };
  }
  return {
    format: block?.format ?? 'strength',
    timeCapSec: block ? timeCapDraft(block) : defaultTimeCapForFormat('strength'),
    targetRounds: str(block?.targetRounds),
    order,
    selected,
    supersetGroups: {},
  };
}

/**
 * Reconstruit les brouillons éditables d'une séance enregistrée, pour rouvrir
 * le constructeur sur une séance existante.
 *
 * Une séance d'avant le support des blocs n'a que des exercices, sans
 * `blockId` : elle est ramenée à un unique bloc `strength`, exactement comme le
 * fait déjà le lancement d'une séance. Sans ce rattrapage, l'éditer la viderait
 * de tout son contenu.
 */
export function sessionToBlockDrafts(
  blocks: UserSessionBlock[],
  exercises: UserSessionExercise[],
): BlockDraft[] {
  if (blocks.length === 0) {
    return exercises.length > 0 ? [draftFor(null, exercises)] : [emptyBlock()];
  }
  const byBlock = new Map<string, UserSessionExercise[]>();
  for (const e of exercises) {
    if (!e.blockId) continue;
    if (!byBlock.has(e.blockId)) byBlock.set(e.blockId, []);
    byBlock.get(e.blockId)!.push(e);
  }
  const drafts = [...blocks]
    .sort((a, b) => a.order - b.order)
    // Un bloc sans exercice ne survivrait pas à l'enregistrement
    // (`blocksToSessionInput` le saute) : ne pas le rouvrir non plus.
    .filter((b) => (byBlock.get(b.id) ?? []).length > 0)
    .map((b) => draftFor(b, byBlock.get(b.id) ?? []));
  return drafts.length > 0 ? drafts : [emptyBlock()];
}
