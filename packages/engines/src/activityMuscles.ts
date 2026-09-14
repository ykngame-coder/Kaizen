import type { ActivityType, Intensity, MuscleGroup } from '@supotsu/core';

/**
 * Muscles sollicités par type d'activité, pour préremplir une activité que
 * l'utilisateur n'a pas taguée : une course sollicite toujours les mêmes
 * muscles, contrairement à une séance de musculation ou de cross-training, où
 * seul lui sait ce qu'il a fait — ces types-là n'ont volontairement aucun
 * profil.
 *
 * Table validée par l'utilisateur le 2026-09-14 (page « Muscles par
 * activité »). Les clés `hk:<nom>` couvrent les séances qu'Apple Santé range
 * dans « Autre » avec un vrai nom (`healthKitWorkoutName`, stocké dans
 * `notes`).
 *
 * Calculée à la lecture, jamais enregistrée : toutes les activités passées en
 * profitent sans migration, et un ajustement de la table suit tout seul.
 */

export type ActivityWeight = 'normal' | 'light' | 'none';

export interface ActivityMuscleProfile {
  /** Comptent plein. */
  primary: MuscleGroup[];
  /** Comptent moitié. */
  secondary: MuscleGroup[];
  /** Ce que pèse l'activité : une marche ne fatigue pas comme une course. */
  weight: ActivityWeight;
}

type Row = { primary: MuscleGroup[]; secondary: MuscleGroup[]; weight?: ActivityWeight };

const ROWS: Record<string, Row> = {
  running: { primary: ['quads', 'hamstrings', 'glutes', 'calves'], secondary: ['core'] },
  cycling: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  walking: { primary: [], secondary: ['quads', 'glutes', 'calves'], weight: 'light' },
  swimming: { primary: ['back', 'shoulders'], secondary: ['chest', 'triceps', 'core'] },
  hyrox: { primary: ['full_body'], secondary: [] },

  'hk:Arts martiaux': { primary: ['core'], secondary: ['shoulders', 'quads', 'glutes'] },
  'hk:Aviron': { primary: ['back', 'quads'], secondary: ['shoulders', 'biceps', 'hamstrings', 'glutes', 'core'] },
  'hk:Badminton': { primary: ['shoulders', 'quads'], secondary: ['calves', 'core'] },
  'hk:Barre au sol': { primary: ['core'], secondary: ['quads', 'glutes'] },
  'hk:Baseball': { primary: [], secondary: ['shoulders', 'core'], weight: 'light' },
  'hk:Basketball': { primary: ['quads', 'calves'], secondary: ['shoulders', 'hamstrings', 'glutes'] },
  'hk:Boxe': { primary: ['shoulders', 'core'], secondary: ['chest', 'back', 'triceps', 'quads', 'calves'] },
  'hk:Corde à sauter': { primary: ['calves'], secondary: ['shoulders', 'quads'] },
  'hk:Elliptique': { primary: ['quads', 'glutes'], secondary: ['shoulders', 'hamstrings', 'calves'] },
  'hk:Escalade': { primary: ['back', 'biceps'], secondary: ['shoulders', 'core'] },
  'hk:Escaliers': { primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings'] },
  'hk:Fitness aquatique': { primary: [], secondary: ['shoulders', 'quads', 'core'], weight: 'light' },
  'hk:Football': { primary: ['quads', 'hamstrings', 'calves'], secondary: ['glutes', 'core'] },
  'hk:Golf': { primary: [], secondary: ['back', 'shoulders', 'core'], weight: 'light' },
  'hk:Gymnastique': { primary: ['shoulders', 'core'], secondary: ['chest', 'back', 'triceps'] },
  'hk:Handball': { primary: ['shoulders', 'quads'], secondary: ['calves', 'core'] },
  'hk:Handbike': { primary: ['shoulders', 'triceps'], secondary: ['chest', 'back', 'biceps'] },
  'hk:Kickboxing': { primary: ['shoulders', 'core'], secondary: ['triceps', 'quads', 'glutes', 'calves'] },
  'hk:Lutte': { primary: ['full_body'], secondary: [] },
  'hk:Montée d’escaliers': { primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings'] },
  'hk:Patinage': { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },
  'hk:Pilates': { primary: ['core'], secondary: ['glutes'] },
  'hk:Randonnée': { primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'core'] },
  'hk:Renforcement (core)': { primary: ['core'], secondary: [] },
  'hk:Rugby': { primary: ['full_body'], secondary: [] },
  'hk:Ski alpin': { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },
  'hk:Ski de fond': { primary: ['quads', 'glutes'], secondary: ['back', 'shoulders', 'triceps', 'core'] },
  'hk:Snowboard': { primary: ['quads', 'glutes'], secondary: ['calves', 'core'] },
  'hk:Sports de neige': { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },
  'hk:Sports de pagaie': { primary: ['back', 'shoulders'], secondary: ['biceps', 'core'] },
  'hk:Squash': { primary: ['shoulders', 'quads'], secondary: ['glutes', 'calves', 'core'] },
  'hk:Surf': { primary: ['back', 'shoulders'], secondary: ['core'] },
  'hk:Tennis': { primary: ['shoulders', 'quads'], secondary: ['glutes', 'calves', 'core'] },
  'hk:Volleyball': { primary: ['quads', 'calves'], secondary: ['shoulders', 'core'] },
  'hk:Water-polo': { primary: ['back', 'shoulders'], secondary: ['quads', 'core'] },
};

export const ACTIVITY_MUSCLE_PROFILES: Readonly<Record<string, ActivityMuscleProfile>> = Object.fromEntries(
  Object.entries(ROWS).map(([k, r]) => [k, { primary: r.primary, secondary: r.secondary, weight: r.weight ?? 'normal' }]),
);

/**
 * Le profil d'une activité, ou `null` quand on ne préremplit rien. Pour « Autre »,
 * le nom donné par Apple Santé décide ; un nom inconnu ne devine rien.
 */
export function profileFor(activity: { type: ActivityType; notes?: string }): ActivityMuscleProfile | null {
  if (activity.type === 'other') return (activity.notes && ACTIVITY_MUSCLE_PROFILES[`hk:${activity.notes}`]) || null;
  return ACTIVITY_MUSCLE_PROFILES[activity.type] ?? null;
}

/**
 * Durée qui pèse une séance pleine. 30 min (45 à l'origine) : une course
 * d'une demi-heure la veille laissait les jambes « Bon », ce que l'utilisateur
 * jugeait trop léger (retour du 14 sept.).
 */
export const LOAD_REFERENCE_MIN = 30;
const DURATION_FACTOR_MIN = 0.25;
const DURATION_FACTOR_MAX = 2;
const INTENSITY_FACTOR: Record<Intensity, number> = { low: 0.7, moderate: 1, high: 1.25, max: 1.5 };
const WEIGHT_FACTOR: Record<ActivityWeight, number> = { normal: 1, light: 0.4, none: 0 };

/** FC de repos retenue quand Santé n'en a jamais mesuré — une valeur d'adulte ordinaire. */
const DEFAULT_RESTING_HR = 60;

export interface HeartRateContext {
  /** Dernière FC de repos mesurée. */
  restingHr?: number;
  /** FC max estimée (`maxHeartRateFor`). Sans elle, aucune intensité n'est déduite. */
  maxHr?: number;
}

/**
 * FC max estimée d'après l'âge — formule de Tanaka (208 − 0,7 × âge), plus
 * juste que 220 − âge au-delà de 40 ans. `undefined` sans date de naissance
 * plausible : on ne devine pas un âge.
 */
export function maxHeartRateFor(birthDate: string | undefined, asOf: string): number | undefined {
  if (!birthDate) return undefined;
  const born = new Date(birthDate);
  const now = new Date(asOf);
  // Âge en années révolues : l'anniversaire de cette année est-il passé ?
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  const age = now.getUTCFullYear() - born.getUTCFullYear() - (beforeBirthday ? 1 : 0);
  if (!Number.isFinite(age) || age < 10 || age > 100) return undefined;
  return 208 - 0.7 * age;
}

/**
 * L'intensité d'une activité d'après sa FC moyenne — méthode de Karvonen : la
 * part de la réserve cardiaque (FC max − FC de repos) utilisée. Les
 * activités importées d'Apple Santé n'ont pas d'intensité déclarée ; leur FC
 * suffit à distinguer un footing d'une séance au seuil.
 */
export function intensityFromHeartRate(avgHeartRate: number | undefined, hr: HeartRateContext): Intensity | undefined {
  if (avgHeartRate == null || hr.maxHr == null) return undefined;
  const resting = hr.restingHr ?? DEFAULT_RESTING_HR;
  const reserve = hr.maxHr - resting;
  if (!(reserve > 0)) return undefined;
  const share = (avgHeartRate - resting) / reserve;
  if (share < 0.55) return 'low';
  if (share < 0.7) return 'moderate';
  if (share < 0.82) return 'high';
  return 'max';
}

/**
 * Ce que pèse une activité dans la fatigue musculaire (1 = une séance
 * structurée) : sa durée rapportée à 30 min — bornée d'un quart à deux
 * séances —, son intensité (déclarée, sinon estimée d'après la FC moyenne) et
 * le poids de son type. Sans cela, une marche de 10 min fatiguait les jambes
 * comme un semi-marathon.
 */
export function activityMuscleLoad(
  activity: { type: ActivityType; notes?: string; durationSec: number; intensity?: Intensity; avgHeartRate?: number },
  hr: HeartRateContext = {},
): number {
  const minutes = activity.durationSec / 60;
  const duration = Math.min(DURATION_FACTOR_MAX, Math.max(DURATION_FACTOR_MIN, minutes / LOAD_REFERENCE_MIN));
  const level = activity.intensity ?? intensityFromHeartRate(activity.avgHeartRate, hr);
  const intensity = level ? INTENSITY_FACTOR[level] : 1;
  const weight = WEIGHT_FACTOR[profileFor(activity)?.weight ?? 'normal'];
  return duration * intensity * weight;
}
