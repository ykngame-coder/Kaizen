import type { BlockFormat, SetEntry } from '@supotsu/core';

/**
 * L'objectif d'une prescription, dit dans son unité.
 *
 * Une séance de coach est chronométrée, chargée, parfois exprimée en mètres :
 * l'afficher en « séries × répétitions » la rendait méconnaissable. Sert à
 * l'aperçu d'un programme comme au lecteur en pleine séance — les deux doivent
 * annoncer exactement la même chose.
 */

type PreviewSet = Pick<SetEntry, 'exerciseId' | 'order' | 'reps' | 'weightKg' | 'durationSec' | 'distanceM'>;

interface PreviewBlock {
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
  sets: PreviewSet[];
}

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** « 8 min », ou « 8 min 1 s » quand la seconde compte — les plafonds Garmin tombent rarement rond. */
function minutes(sec: number): string {
  const rest = sec % 60;
  return rest === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)} min ${rest} s`;
}

export function describeSet(set: PreviewSet): string {
  const parts: string[] = [];
  if (set.durationSec != null) parts.push(mmss(set.durationSec));
  else if (set.distanceM != null) parts.push(`${set.distanceM} m`);
  else if (set.reps != null) parts.push(`${set.reps} rép.`);
  if (set.weightKg != null) parts.push(`${set.weightKg} kg`);
  // Une étape sans consigne se termine au bouton, pas au chrono : le dire
  // vaut mieux qu'une ligne vide.
  return parts.length > 0 ? parts.join(' · ') : 'libre';
}

const FORMAT_LABEL: Record<BlockFormat, string> = {
  strength: '',
  amrap: 'AMRAP',
  emom: 'EMOM',
  for_time: 'Pour le temps',
  tabata: 'Tabata',
  hyrox: 'Hyrox',
};

export function describeBlock(block: PreviewBlock): string {
  const label = FORMAT_LABEL[block.format];
  if (block.format === 'strength') {
    return block.targetRounds && block.targetRounds > 1 ? `${block.targetRounds} tours` : '';
  }
  return block.timeCapSec != null ? `${label} ${minutes(block.timeCapSec)}`.trim() : label;
}
