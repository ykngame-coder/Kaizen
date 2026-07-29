import type { MuscleGroup } from '@supotsu/core';
import data from './exercises.data.json';

export type ExerciseCategory = 'force' | 'cardio' | 'mobilité';

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  category: ExerciseCategory;
  equipment: string;
  level: string;
  mechanic: string | null;
  instructions: string[];
  /** Relative image path in the free-exercise-db repo (e.g. "Squat/0.jpg"). */
  image: string | null;
}

/**
 * Exercise catalogue — 873 exercises from the open-source free-exercise-db
 * (github.com/yuhonas/free-exercise-db, Unlicense / public domain), transformed
 * to our schema: muscles mapped to our groups, categories and equipment in
 * French, with instructions and image references kept for the detail view.
 */
export const EXERCISES = data as unknown as Exercise[];

/** Build a CDN URL for an exercise image path. */
export function exerciseImageUrl(image: string | null): string | null {
  return image ? `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/${image}` : null;
}

/** French muscle-group labels for the library UI. */
export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Bras', triceps: 'Triceps',
  quads: 'Quadriceps', hamstrings: 'Ischios', glutes: 'Fessiers', calves: 'Mollets', core: 'Abdos / gainage', full_body: 'Corps entier',
};

export const MUSCLE_ICON: Record<MuscleGroup, string> = {
  chest: '🫀', back: '🔙', shoulders: '💪', biceps: '💪', triceps: '💪', quads: '🦵', hamstrings: '🦵', glutes: '🍑', calves: '🦵', core: '🧱', full_body: '🏃',
};
export const CATEGORY_ICON: Record<ExerciseCategory, string> = { force: '🏋️', cardio: '🏃', mobilité: '🧘' };
