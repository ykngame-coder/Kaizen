import type { MuscleGroup } from '@supotsu/core';

export interface Stretch {
  id: string;
  name: string;
  muscle: MuscleGroup;
  holdSec: number;
  /** True when it's a one-side-at-a-time stretch (left, then right). */
  sides: boolean;
}

export const ZONE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  core: 'Core',
  full_body: 'Corps entier',
};

export const STRETCH_LIBRARY: Stretch[] = [
  { id: 'chest-wall', name: 'Étirement pectoraux au mur', muscle: 'chest', holdSec: 30, sides: true },
  { id: 'chest-behind-back', name: 'Ouverture de poitrine, mains dans le dos', muscle: 'chest', holdSec: 30, sides: false },
  { id: 'back-cat', name: 'Dos rond (chat)', muscle: 'back', holdSec: 30, sides: false },
  { id: 'back-seated-twist', name: 'Torsion assise du dos', muscle: 'back', holdSec: 30, sides: true },
  { id: 'shoulders-cross-arm', name: 'Étirement épaule, bras croisé', muscle: 'shoulders', holdSec: 30, sides: true },
  { id: 'shoulders-trap-tilt', name: 'Étirement trapèzes, inclinaison de tête', muscle: 'shoulders', holdSec: 30, sides: true },
  { id: 'biceps-wall', name: 'Étirement biceps, bras tendu contre un mur', muscle: 'biceps', holdSec: 30, sides: true },
  { id: 'triceps-overhead', name: 'Étirement triceps, bras au-dessus de la tête', muscle: 'triceps', holdSec: 30, sides: true },
  { id: 'quads-standing', name: 'Étirement quadriceps debout (talon-fesse)', muscle: 'quads', holdSec: 30, sides: true },
  { id: 'quads-lunge', name: 'Fente avant, étirement quadriceps/psoas', muscle: 'quads', holdSec: 30, sides: true },
  { id: 'hamstrings-straight-leg', name: 'Étirement ischios, jambe tendue', muscle: 'hamstrings', holdSec: 30, sides: true },
  { id: 'hamstrings-seated', name: 'Étirement ischios assis, buste penché', muscle: 'hamstrings', holdSec: 30, sides: false },
  { id: 'glutes-figure-4', name: 'Étirement fessier, figure 4', muscle: 'glutes', holdSec: 30, sides: true },
  { id: 'glutes-knee-to-chest', name: 'Étirement piriforme, genou vers la poitrine', muscle: 'glutes', holdSec: 30, sides: true },
  { id: 'calves-wall', name: 'Étirement mollets contre un mur', muscle: 'calves', holdSec: 30, sides: true },
  { id: 'calves-seated', name: 'Étirement mollet assis (serviette)', muscle: 'calves', holdSec: 30, sides: true },
  { id: 'core-cobra', name: 'Extension lombaire (cobra)', muscle: 'core', holdSec: 30, sides: false },
  { id: 'core-lying-twist', name: 'Torsion lombaire allongée', muscle: 'core', holdSec: 30, sides: true },
  { id: 'full-body-downdog', name: 'Chien tête en bas', muscle: 'full_body', holdSec: 30, sides: false },
  { id: 'full-body-side-reach', name: 'Étirement latéral complet, debout', muscle: 'full_body', holdSec: 30, sides: true },
];

/** Stretches for one muscle group, in library order. */
export function stretchesForZone(muscle: MuscleGroup): Stretch[] {
  return STRETCH_LIBRARY.filter((s) => s.muscle === muscle);
}

/** One or two stretches per given muscle, in the order the muscles are listed (most relevant first). */
export function stretchesForMuscles(muscles: MuscleGroup[], perMuscle = 2): Stretch[] {
  const out: Stretch[] = [];
  for (const m of muscles) {
    out.push(...stretchesForZone(m).slice(0, perMuscle));
  }
  return out;
}
