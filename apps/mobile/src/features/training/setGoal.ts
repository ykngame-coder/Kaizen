import type { BlockFormat, SetEntry } from '@supotsu/core';

/**
 * L'objectif d'une prescription, dit dans son unité.
 *
 * Une séance de coach est chronométrée, chargée, parfois exprimée en mètres :
 * l'afficher en « séries × répétitions » la rendait méconnaissable. Sert à
 * l'aperçu d'un programme comme au lecteur en pleine séance — les deux doivent
 * annoncer exactement la même chose.
 */

type PreviewSet = Pick<SetEntry, 'exerciseId' | 'order' | 'reps' | 'weightKg' | 'durationSec' | 'distanceM' | 'restSec'>;

interface PreviewBlock {
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
  /** Repos intra-tabata (entre chaque round de travail) — n'a de sens que pour ce format. */
  restSec?: number;
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
  // Les deux ensemble disent « N allers-retours de M mètres » (navettes,
  // portées) — un else if aurait affiché la distance seule et fait
  // disparaître le nombre de répétitions.
  else if (set.reps != null && set.distanceM != null) parts.push(`${set.reps} × ${set.distanceM} m`);
  else if (set.distanceM != null) parts.push(`${set.distanceM} m`);
  else if (set.reps != null) parts.push(`${set.reps} rép.`);
  if (set.weightKg != null) parts.push(`${set.weightKg} kg`);
  // Le repos entre deux blocs (pas le repos intra-tabata, qui vit sur le
  // bloc) se lit sur le dernier exercice d'un bloc — sinon il reste écrit
  // en base sans jamais être montré, ni appliqué par le lecteur de séance.
  if (set.restSec != null) parts.push(`repos ${mmss(set.restSec)}`);
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
  const rounds = block.targetRounds && block.targetRounds > 1 ? `${block.targetRounds} tours` : '';
  if (block.format === 'strength') return rounds;
  // Le tabata a un travail ET un repos intra-round (BlockTimeline.tsx fait
  // déjà « 30/30 s » au lecteur de séance) — n'afficher que le temps de
  // travail cachait la moitié du rythme réel du bloc.
  const base =
    block.format === 'tabata' && block.timeCapSec != null && block.restSec != null
      ? `${label} ${block.timeCapSec}/${block.restSec} s`
      : block.timeCapSec != null
        ? `${label} ${minutes(block.timeCapSec)}`.trim()
        : label;
  // Un tabata/EMOM/hyrox à plusieurs tours taisait son nombre de tours — un
  // bloc « 8×30s/30s » s'affichait comme un simple « Tabata 0 min 30 s »,
  // indiscernable d'un bloc à un seul tour.
  return rounds ? `${base} · ${rounds}` : base;
}
