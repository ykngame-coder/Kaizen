import type { ISODateString, OwnedEntity, UUID } from './common';

export type ExerciseCategory =
  'strength' | 'hypertrophy' | 'endurance' | 'mobility' | 'functional' | 'sport_specific';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'full_body';

export type Level = 'beginner' | 'intermediate' | 'advanced';

/** Shared exercise library entry (Master Prompt P5.5, P36.3, read-only to users). */
export interface Exercise {
  id: UUID;
  name: string;
  category: ExerciseCategory;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: string[];
  level: Level;
  instructions?: string;
  commonMistakes?: string[];
  variants?: string[];
  mediaUrl?: string;
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

/** A training session, planned then realized (Master Prompt P11.5, P32.7). */
export interface Workout extends OwnedEntity {
  programId?: UUID;
  name: string;
  status: WorkoutStatus;
  plannedFor?: ISODateString;
  completedAt?: ISODateString;
  durationSec?: number;
  /** Session-level rate of perceived exertion, 1-10 (Master Prompt P36.11). */
  rpe?: number;
  notes?: string;
}

/** A single performed set (Master Prompt P32.9, P51.7). */
export interface SetEntry {
  id: UUID;
  workoutId: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
  /** Set-level RPE. */
  rpe?: number;
}
