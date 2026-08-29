import { z } from 'zod';
import { goalTypeSchema, habitInputSchema, sexSchema, sportLevelSchema } from '@supotsu/shared';

/** Empty string → undefined, otherwise a positive number. */
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().positive().optional(),
);

/**
 * Single form backing the 6-step onboarding (Master Prompt P17.2). Steps
 * validate their own subset via react-hook-form `trigger`.
 */
export const onboardingSchema = z.object({
  // Step 2 — sport profile
  level: sportLevelSchema,
  sex: sexSchema,
  heightCm: optionalNumber,
  weightKg: optionalNumber,
  sports: z.array(z.string()).default([]),
  // Step 3 — objective
  primaryGoal: z.enum(['fat_loss', 'muscle', 'hyrox', 'marathon', 'sleep', 'stress']).default('fat_loss'),
  goalType: goalTypeSchema,
  goalTitle: z.string().min(1, 'Donne un titre à ton objectif').max(120),
  goalTargetValue: optionalNumber,
  // Step 4 — availability
  weeklyAvailability: z.number().int().min(0).max(21).optional(),
  equipment: z.array(z.string()).default([]),
  // Step 5 — habits (real Habit rows, created alongside the profile/goal)
  habits: z.array(habitInputSchema).max(10).default([]),
});

export type OnboardingForm = z.infer<typeof onboardingSchema>;

/** Fields validated at each step (index aligns with the flow's step order). */
export const STEP_FIELDS: (keyof OnboardingForm)[][] = [
  [], // 0 welcome
  ['level', 'sex', 'heightCm', 'weightKg', 'sports'], // 1 profile
  ['goalType', 'goalTitle'], // 2 objective
  ['weeklyAvailability', 'equipment'], // 3 availability
  [], // 4 habits
  [], // 5 connections
  [], // 6 summary
];
