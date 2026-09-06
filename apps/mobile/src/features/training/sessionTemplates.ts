import type { BlockDraft, SetDraft } from './sessionBuilder';
import { newSlotId } from './sessionBuilder';

/**
 * Modèles de séance prêts à l'emploi (Lot 3) — un point de départ, pas une
 * prescription : ils remplissent le builder, l'utilisateur ajuste puis
 * enregistre. Rien n'est écrit tant qu'il ne valide pas.
 *
 * Les identifiants d'exercice sont ceux du catalogue (exercises.data.json) et
 * sont vérifiés par sessionTemplates.test.ts : un id absent afficherait
 * l'identifiant brut à l'écran, exactement le défaut corrigé au build 45.
 */

export interface TemplateExercise {
  exerciseId: string;
  reps: number;
  weightKg?: number;
  restSec?: number;
}

export interface TemplateBlock {
  format: BlockDraft['format'];
  /** Minutes pour AMRAP/For Time, secondes d'intervalle pour EMOM. */
  timeCap?: number;
  targetRounds?: number;
  exercises: TemplateExercise[];
}

export interface SessionTemplate {
  id: string;
  /** Clés i18n, pour que les modèles existent dans les cinq langues. */
  nameKey: string;
  descriptionKey: string;
  blocks: TemplateBlock[];
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: 'full-body',
    nameKey: 'sport.templates.fullBody.name',
    descriptionKey: 'sport.templates.fullBody.description',
    blocks: [
      {
        format: 'strength',
        exercises: [
          { exerciseId: 'Barbell_Squat', reps: 8, restSec: 120 },
          { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', reps: 8, restSec: 120 },
          { exerciseId: 'Bent_Over_Barbell_Row', reps: 10, restSec: 90 },
          { exerciseId: 'Plank', reps: 45, restSec: 60 },
        ],
      },
    ],
  },
  {
    id: 'push',
    nameKey: 'sport.templates.push.name',
    descriptionKey: 'sport.templates.push.description',
    blocks: [
      {
        format: 'strength',
        exercises: [
          { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', reps: 8, restSec: 120 },
          { exerciseId: 'Standing_Military_Press', reps: 8, restSec: 90 },
          { exerciseId: 'Dips_-_Triceps_Version', reps: 10, restSec: 90 },
          { exerciseId: 'Push-Up_Wide', reps: 15, restSec: 60 },
        ],
      },
    ],
  },
  {
    id: 'pull',
    nameKey: 'sport.templates.pull.name',
    descriptionKey: 'sport.templates.pull.description',
    blocks: [
      {
        format: 'strength',
        exercises: [
          { exerciseId: 'Barbell_Deadlift', reps: 5, restSec: 180 },
          { exerciseId: 'Pullups', reps: 8, restSec: 120 },
          { exerciseId: 'Wide-Grip_Lat_Pulldown', reps: 10, restSec: 90 },
          { exerciseId: 'Barbell_Curl', reps: 12, restSec: 60 },
        ],
      },
    ],
  },
  {
    id: 'legs',
    nameKey: 'sport.templates.legs.name',
    descriptionKey: 'sport.templates.legs.description',
    blocks: [
      {
        format: 'strength',
        exercises: [
          { exerciseId: 'Barbell_Full_Squat', reps: 8, restSec: 150 },
          { exerciseId: 'Romanian_Deadlift', reps: 10, restSec: 120 },
          { exerciseId: 'Dumbbell_Lunges', reps: 12, restSec: 90 },
          { exerciseId: 'Leg_Press', reps: 12, restSec: 90 },
        ],
      },
    ],
  },
  {
    id: 'wod-amrap',
    nameKey: 'sport.templates.wod.name',
    descriptionKey: 'sport.templates.wod.description',
    blocks: [
      {
        format: 'amrap',
        timeCap: 12,
        exercises: [
          { exerciseId: 'Burpees', reps: 10 },
          { exerciseId: 'One-Arm_Kettlebell_Swings', reps: 12 },
          { exerciseId: 'Kettlebell_Thruster', reps: 10 },
        ],
      },
    ],
  },
];

/** Transforme un modèle en brouillons de blocs, prêts pour le builder. */
export function templateToBlocks(template: SessionTemplate): BlockDraft[] {
  return template.blocks.map((b) => {
    const order: string[] = [];
    const selected: Record<string, SetDraft> = {};
    for (const ex of b.exercises) {
      const slotId = newSlotId(ex.exerciseId);
      order.push(slotId);
      selected[slotId] = {
        exerciseId: ex.exerciseId,
        reps: String(ex.reps),
        weight: ex.weightKg != null ? String(ex.weightKg) : '',
        rest: ex.restSec != null ? String(ex.restSec) : '',
      };
    }
    return {
      format: b.format,
      timeCapSec: b.timeCap != null ? String(b.timeCap) : '',
      targetRounds: b.targetRounds != null ? String(b.targetRounds) : '',
      order,
      selected,
      supersetGroups: {},
    };
  });
}
