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
  deadline: z.string().datetime().optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

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
