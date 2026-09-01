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

export type BlockFormat = 'strength' | 'amrap' | 'emom' | 'for_time';

/**
 * One ordered segment of a session (Master Prompt — circuit workout
 * formats). A plain strength-only workout has zero blocks; its sets hang
 * directly off `workoutId` with no `blockId`, exactly as before this
 * existed. A session with one or more blocks (AMRAP/EMOM/Pour le temps, or
 * even a single strength block) runs them in order.
 */
export interface WorkoutBlock {
  id: UUID;
  workoutId: UUID;
  order: number;
  format: BlockFormat;
  /** AMRAP cap, or EMOM interval length, in seconds. */
  timeCapSec?: number;
  /** EMOM interval count, or "pour le temps" round count. */
  targetRounds?: number;
  /** Rounds actually completed — set once the block finishes. */
  completedRounds?: number;
  /** "Pour le temps" finish time, in seconds — set once the block finishes. */
  resultTimeSec?: number;
}

/** A single performed set (Master Prompt P32.9, P51.7). */
export interface SetEntry {
  id: UUID;
  workoutId: UUID;
  /** The block this set belongs to, for a circuit-format session — absent for a plain strength set. */
  blockId?: UUID;
  exerciseId: UUID;
  order: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
  /** Set-level RPE. */
  rpe?: number;
  /** Sets sharing this number, within the same block and adjacent in order, form one superset — alternated live, no rest between members. */
  supersetGroup?: number;
}
