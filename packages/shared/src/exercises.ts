import type { Exercise } from '@supotsu/core';

/**
 * Seed exercise library (Master Prompt P5.5, P36.3). Static reference data used
 * offline and to seed the `exercises` table. Stable ids so sets can reference
 * them regardless of backend.
 */
export const EXERCISE_LIBRARY: Exercise[] = [
  {
    id: 'ex-back-squat',
    name: 'Squat barre',
    category: 'strength',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['core', 'hamstrings'],
    equipment: ['gym'],
    level: 'intermediate',
  },
  {
    id: 'ex-deadlift',
    name: 'Soulevé de terre',
    category: 'strength',
    primaryMuscles: ['back', 'hamstrings', 'glutes'],
    secondaryMuscles: ['core'],
    equipment: ['gym'],
    level: 'advanced',
  },
  {
    id: 'ex-bench-press',
    name: 'Développé couché',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: ['gym'],
    level: 'intermediate',
  },
  {
    id: 'ex-pull-up',
    name: 'Traction',
    category: 'strength',
    primaryMuscles: ['back', 'biceps'],
    secondaryMuscles: ['core'],
    equipment: [],
    level: 'intermediate',
  },
  {
    id: 'ex-push-up',
    name: 'Pompes',
    category: 'strength',
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['core', 'shoulders'],
    equipment: [],
    level: 'beginner',
  },
  {
    id: 'ex-kb-swing',
    name: 'Kettlebell swing',
    category: 'functional',
    primaryMuscles: ['glutes', 'hamstrings'],
    secondaryMuscles: ['core', 'back'],
    equipment: ['kettlebell'],
    level: 'beginner',
  },
  {
    id: 'ex-wall-balls',
    name: 'Wall balls',
    category: 'sport_specific',
    primaryMuscles: ['quads', 'shoulders'],
    secondaryMuscles: ['core'],
    equipment: ['gym'],
    level: 'intermediate',
  },
  {
    id: 'ex-plank',
    name: 'Gainage',
    category: 'mobility',
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    equipment: [],
    level: 'beginner',
  },
];
