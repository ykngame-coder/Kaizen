import type { MuscleGroup } from '@supotsu/core';

export type ExerciseCategory = 'force' | 'cardio' | 'mobilité';
export type Equipment = 'Barre' | 'Haltères' | 'Poulie' | 'Machine' | 'Kettlebell' | 'Poids du corps' | 'Élastique' | 'Cardio';

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
  category: ExerciseCategory;
  equipment: Equipment;
}

/** French muscle-group labels for the library UI. */
export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quadriceps', hamstrings: 'Ischios', glutes: 'Fessiers', calves: 'Mollets', core: 'Abdos / gainage', full_body: 'Corps entier',
};

/**
 * Curated exercise catalogue (no external DB needed). Covers the major movement
 * patterns per muscle group across force, cardio and mobility, with the primary
 * muscle worked and the equipment required — enough to browse, search and filter.
 */
export const EXERCISES: Exercise[] = [
  // Chest
  { id: 'bench-press', name: 'Développé couché', primary: 'chest', secondary: ['triceps', 'shoulders'], category: 'force', equipment: 'Barre' },
  { id: 'incline-db-press', name: 'Développé incliné haltères', primary: 'chest', secondary: ['shoulders'], category: 'force', equipment: 'Haltères' },
  { id: 'dips-chest', name: 'Dips (pectoraux)', primary: 'chest', secondary: ['triceps'], category: 'force', equipment: 'Poids du corps' },
  { id: 'cable-fly', name: 'Écarté à la poulie', primary: 'chest', category: 'force', equipment: 'Poulie' },
  { id: 'pushup', name: 'Pompes', primary: 'chest', secondary: ['triceps', 'core'], category: 'force', equipment: 'Poids du corps' },
  // Back
  { id: 'pullup', name: 'Tractions', primary: 'back', secondary: ['biceps'], category: 'force', equipment: 'Poids du corps' },
  { id: 'barbell-row', name: 'Rowing barre', primary: 'back', secondary: ['biceps'], category: 'force', equipment: 'Barre' },
  { id: 'lat-pulldown', name: 'Tirage vertical', primary: 'back', secondary: ['biceps'], category: 'force', equipment: 'Poulie' },
  { id: 'seated-row', name: 'Tirage horizontal', primary: 'back', secondary: ['biceps'], category: 'force', equipment: 'Poulie' },
  { id: 'deadlift', name: 'Soulevé de terre', primary: 'back', secondary: ['hamstrings', 'glutes'], category: 'force', equipment: 'Barre' },
  // Shoulders
  { id: 'ohp', name: 'Développé militaire', primary: 'shoulders', secondary: ['triceps'], category: 'force', equipment: 'Barre' },
  { id: 'lateral-raise', name: 'Élévations latérales', primary: 'shoulders', category: 'force', equipment: 'Haltères' },
  { id: 'face-pull', name: 'Face pull', primary: 'shoulders', secondary: ['back'], category: 'force', equipment: 'Poulie' },
  { id: 'arnold-press', name: 'Développé Arnold', primary: 'shoulders', category: 'force', equipment: 'Haltères' },
  // Biceps
  { id: 'barbell-curl', name: 'Curl barre', primary: 'biceps', category: 'force', equipment: 'Barre' },
  { id: 'hammer-curl', name: 'Curl marteau', primary: 'biceps', category: 'force', equipment: 'Haltères' },
  { id: 'cable-curl', name: 'Curl poulie', primary: 'biceps', category: 'force', equipment: 'Poulie' },
  // Triceps
  { id: 'triceps-pushdown', name: 'Extension poulie', primary: 'triceps', category: 'force', equipment: 'Poulie' },
  { id: 'skullcrusher', name: 'Barre au front', primary: 'triceps', category: 'force', equipment: 'Barre' },
  { id: 'dips-triceps', name: 'Dips (triceps)', primary: 'triceps', secondary: ['chest'], category: 'force', equipment: 'Poids du corps' },
  // Quads
  { id: 'back-squat', name: 'Squat', primary: 'quads', secondary: ['glutes', 'core'], category: 'force', equipment: 'Barre' },
  { id: 'front-squat', name: 'Front squat', primary: 'quads', secondary: ['core'], category: 'force', equipment: 'Barre' },
  { id: 'leg-press', name: 'Presse à cuisses', primary: 'quads', secondary: ['glutes'], category: 'force', equipment: 'Machine' },
  { id: 'lunge', name: 'Fentes', primary: 'quads', secondary: ['glutes'], category: 'force', equipment: 'Haltères' },
  { id: 'bulgarian-split', name: 'Fente bulgare', primary: 'quads', secondary: ['glutes'], category: 'force', equipment: 'Haltères' },
  // Hamstrings
  { id: 'rdl', name: 'Soulevé de terre roumain', primary: 'hamstrings', secondary: ['glutes'], category: 'force', equipment: 'Barre' },
  { id: 'leg-curl', name: 'Leg curl', primary: 'hamstrings', category: 'force', equipment: 'Machine' },
  { id: 'good-morning', name: 'Good morning', primary: 'hamstrings', secondary: ['back'], category: 'force', equipment: 'Barre' },
  // Glutes
  { id: 'hip-thrust', name: 'Hip thrust', primary: 'glutes', secondary: ['hamstrings'], category: 'force', equipment: 'Barre' },
  { id: 'glute-bridge', name: 'Pont fessier', primary: 'glutes', category: 'force', equipment: 'Poids du corps' },
  { id: 'kb-swing', name: 'Kettlebell swing', primary: 'glutes', secondary: ['hamstrings', 'core'], category: 'force', equipment: 'Kettlebell' },
  // Calves
  { id: 'standing-calf', name: 'Mollets debout', primary: 'calves', category: 'force', equipment: 'Machine' },
  { id: 'seated-calf', name: 'Mollets assis', primary: 'calves', category: 'force', equipment: 'Machine' },
  // Core
  { id: 'plank', name: 'Gainage (planche)', primary: 'core', category: 'force', equipment: 'Poids du corps' },
  { id: 'hanging-leg-raise', name: 'Relevé de jambes suspendu', primary: 'core', category: 'force', equipment: 'Poids du corps' },
  { id: 'ab-wheel', name: 'Roue abdominale', primary: 'core', category: 'force', equipment: 'Poids du corps' },
  { id: 'cable-crunch', name: 'Crunch poulie', primary: 'core', category: 'force', equipment: 'Poulie' },
  { id: 'russian-twist', name: 'Russian twist', primary: 'core', category: 'force', equipment: 'Poids du corps' },
  // Cardio / full body
  { id: 'run', name: 'Course à pied', primary: 'full_body', category: 'cardio', equipment: 'Cardio' },
  { id: 'row-erg', name: 'Rameur', primary: 'full_body', secondary: ['back'], category: 'cardio', equipment: 'Cardio' },
  { id: 'assault-bike', name: 'Assault bike', primary: 'full_body', category: 'cardio', equipment: 'Cardio' },
  { id: 'burpee', name: 'Burpees', primary: 'full_body', secondary: ['chest', 'quads'], category: 'cardio', equipment: 'Poids du corps' },
  { id: 'wall-ball', name: 'Wall ball', primary: 'full_body', secondary: ['quads', 'shoulders'], category: 'cardio', equipment: 'Cardio' },
  { id: 'ski-erg', name: 'Ski erg', primary: 'full_body', secondary: ['back', 'core'], category: 'cardio', equipment: 'Cardio' },
  { id: 'jump-rope', name: 'Corde à sauter', primary: 'calves', secondary: ['full_body'], category: 'cardio', equipment: 'Cardio' },
  // Mobility
  { id: 'hip-opener', name: 'Ouverture de hanches', primary: 'glutes', category: 'mobilité', equipment: 'Poids du corps' },
  { id: 'thoracic-rotation', name: 'Rotation thoracique', primary: 'back', category: 'mobilité', equipment: 'Poids du corps' },
  { id: 'couch-stretch', name: 'Couch stretch', primary: 'quads', category: 'mobilité', equipment: 'Poids du corps' },
  { id: 'shoulder-dislocate', name: 'Dislocations épaules', primary: 'shoulders', category: 'mobilité', equipment: 'Élastique' },
  { id: 'world-greatest', name: 'World’s greatest stretch', primary: 'full_body', category: 'mobilité', equipment: 'Poids du corps' },
];

export const MUSCLE_ICON: Record<MuscleGroup, string> = {
  chest: '🫀', back: '🔙', shoulders: '💪', biceps: '💪', triceps: '💪', quads: '🦵', hamstrings: '🦵', glutes: '🍑', calves: '🦵', core: '🧱', full_body: '🏃',
};
export const CATEGORY_ICON: Record<ExerciseCategory, string> = { force: '🏋️', cardio: '🏃', mobilité: '🧘' };
