import { z } from 'zod';

/**
 * Runtime validation at the app boundaries (forms, API, connector payloads).
 * Enum sources of truth are duplicated here as Zod enums; core exposes the TS
 * types. Kept intentionally close so a mismatch surfaces in typecheck.
 */

export const dataSourceSchema = z.enum([
  'manual',
  'apple_health',
  'garmin',
  'strava',
  'renpho',
  'polar',
  'coros',
  'fitbit',
  'oura',
  'withings',
  'supotsu',
]);

export const sportLevelSchema = z.enum(['beginner', 'intermediate', 'confirmed', 'advanced']);
export const sexSchema = z.enum(['male', 'female', 'unspecified']);

export const activityTypeSchema = z.enum([
  'walking',
  'running',
  'cycling',
  'swimming',
  'strength',
  'cross_training',
  'hyrox',
  'mobility',
  'yoga',
  'other',
]);

export const goalTypeSchema = z.enum([
  'performance',
  'strength',
  'endurance',
  'body_composition',
  'health',
  'habit',
]);

/** Onboarding step 2 — sport profile input (Master Prompt P17.2). */
export const athleteProfileInputSchema = z.object({
  birthDate: z.string().datetime().optional(),
  sex: sexSchema.default('unspecified'),
  heightCm: z.number().positive().max(280).optional(),
  weightKg: z.number().positive().max(400).optional(),
  level: sportLevelSchema,
  sports: z.array(z.string()).default([]),
  weeklyAvailability: z.number().int().min(0).max(21).optional(),
  equipment: z.array(z.string()).default([]),
});
export type AthleteProfileInput = z.infer<typeof athleteProfileInputSchema>;

/** Goal creation input (Master Prompt P3 Objectifs). */
export const goalInputSchema = z.object({
  type: goalTypeSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  priority: z.enum(['primary', 'secondary']).default('primary'),
  targetValue: z.number().optional(),
  targetUnit: z.string().max(20).optional(),
  /** Baseline / current value when the goal is created. */
  currentValue: z.number().optional(),
  deadline: z.string().datetime().optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

/** Manual meal / intake logging (Master Prompt P11 nutrition). */
export const nutritionEntryInputSchema = z.object({
  mealType: mealTypeSchema,
  description: z.string().min(1).max(200),
  kcal: z.number().nonnegative().max(10000),
  proteinG: z.number().nonnegative().max(500).optional(),
  carbG: z.number().nonnegative().max(1500).optional(),
  fatG: z.number().nonnegative().max(500).optional(),
  hydrationMl: z.number().nonnegative().max(10000).optional(),
  source: dataSourceSchema.default('manual'),
  loggedAt: z.string().datetime(),
});
export type NutritionEntryInput = z.infer<typeof nutritionEntryInputSchema>;

export const pillarSchema = z.enum([
  'sleep',
  'recovery',
  'performance',
  'nutrition',
  'habits',
  'understanding',
  'decision',
]);

/** Habit creation input (Master Prompt P12 habitudes). */
export const habitInputSchema = z.object({
  name: z.string().min(1).max(80),
  pillar: pillarSchema.default('habits'),
  cadence: z.enum(['daily', 'weekly']).default('daily'),
  targetPerPeriod: z.number().int().positive().max(50).default(1),
});
export type HabitInput = z.infer<typeof habitInputSchema>;

export const muscleGroupSchema = z.enum([
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
]);

/** A user-added exercise not covered by the shared catalogue (e.g. home-gym equipment, a personal variant). */
export const customExerciseInputSchema = z.object({
  name: z.string().min(1).max(80),
  primaryMuscle: muscleGroupSchema,
  secondaryMuscles: z.array(muscleGroupSchema).max(4).default([]),
  equipment: z.string().max(60).optional(),
});
export type CustomExerciseInput = z.infer<typeof customExerciseInputSchema>;

/** Daily mental-wellness check-in (Master Prompt P14 bien-être mental). */
export const wellnessCheckinInputSchema = z.object({
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  note: z.string().max(500).optional(),
});
export type WellnessCheckinInput = z.infer<typeof wellnessCheckinInputSchema>;

export const challengeMetricSchema = z.enum(['activity_count', 'active_days']);

/** Create a community challenge (Master Prompt P37 communauté). */
export const challengeInputSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    metric: challengeMetricSchema.default('activity_count'),
    target: z.number().int().positive().max(1000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    visibility: z.enum(['public', 'private']).default('public'),
  })
  .refine((c) => new Date(c.endsAt) > new Date(c.startsAt), {
    message: 'La date de fin doit être après la date de début.',
    path: ['endsAt'],
  });
export type ChallengeInput = z.infer<typeof challengeInputSchema>;

/** Manual activity logging (Master Prompt MVP 20.3 — ajout manuel activité). */
export const activityInputSchema = z.object({
  type: activityTypeSchema,
  source: dataSourceSchema.default('manual'),
  startedAt: z.string().datetime(),
  durationSec: z.number().int().positive(),
  distanceM: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  intensity: z.enum(['low', 'moderate', 'high', 'max']).optional(),
  avgHeartRate: z.number().int().positive().max(250).optional(),
  notes: z.string().max(1000).optional(),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const programFocusSchema = z.enum([
  'strength',
  'endurance',
  'hyrox',
  'weight_loss',
  'mobility',
  'general',
]);
export const visibilitySchema = z.enum(['private', 'public']);

/** One exercise prescription within a user-created session (mirrors workout_sets). */
export const sessionExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  reps: z.number().int().positive().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
  durationSec: z.number().int().positive().max(36000).optional(),
  restSec: z.number().int().nonnegative().max(3600).optional(),
});
export type SessionExerciseInput = z.infer<typeof sessionExerciseInputSchema>;

/** A user-created reusable session template (Master Prompt-adjacent: user-generated content). */
export const userSessionInputSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(1000).optional(),
  visibility: visibilitySchema.default('private'),
  exercises: z.array(sessionExerciseInputSchema).min(1).max(50),
});
export type UserSessionInput = z.infer<typeof userSessionInputSchema>;

/** A user-created multi-week program (title/focus/level, no sessions yet — those attach separately). */
export const userProgramInputSchema = z.object({
  title: z.string().min(1).max(120),
  focus: programFocusSchema.default('general'),
  level: sportLevelSchema.default('beginner'),
  weeks: z.number().int().positive().max(26),
  description: z.string().max(1000).optional(),
  visibility: visibilitySchema.default('private'),
});
export type UserProgramInput = z.infer<typeof userProgramInputSchema>;

/** Placing one of the user's sessions at a week/day slot in a program's schedule. */
export const programSessionSlotInputSchema = z.object({
  sessionId: z.string().min(1),
  weekNumber: z.number().int().positive().max(26),
  dayIndex: z.number().int().min(0).max(6),
  order: z.number().int().nonnegative().default(0),
});
export type ProgramSessionSlotInput = z.infer<typeof programSessionSlotInputSchema>;
