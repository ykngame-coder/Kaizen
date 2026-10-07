import type { ISODateString, MuscleGroup } from '@supotsu/core';

/**
 * Muscle Map Engine (Master Prompt P36) — Fitbod/Garmin-style. Computes, per
 * muscle group, a "freshness" 0-100 from recent training: a muscle worked hard
 * or recently is fatigued (needs rest); one untouched for a few days is fresh.
 * Pure — sessions in, statuses out.
 *
 * Récupération : effacement progressif, demi-vie 36 h, sur 7 jours (choisi le
 * 2026-09-14 contre la ligne droite sur 3 jours). Une séance isolée redevient
 * « reposé » en ~2,5 jours, comme avant ; mais une semaine chargée s'additionne
 * — quatre séances en 7 jours atteignent « fatigué », ce que la ligne droite
 * sur 3 jours ne voyait presque pas. Étirer la ligne droite à 7 jours aurait
 * laissé une seule course visible toute la semaine.
 */

/** Demi-vie de la fatigue laissée par une séance, en jours. */
export const FATIGUE_HALF_LIFE_DAYS = 1.5;
/** Au-delà, une séance ne compte plus. */
export const FATIGUE_WINDOW_DAYS = 7;
/**
 * Ce qu'UNE séance peut peser sur UN muscle, au plus — l'équivalent d'un seul
 * exercice fait en primaire pur. Sans ce plafond, un circuit varié de quelques
 * exercices polyvalents (ex. kettlebell) peut cumuler primaire + plusieurs
 * petits secondaires sur un même muscle et l'épuiser en une seule séance,
 * alors qu'aucun exercice ne le ciblait vraiment lourdement. L'accumulation
 * sur plusieurs jours (semaine chargée), elle, n'est pas plafonnée.
 */
export const MAX_SESSION_MUSCLE_WEIGHT = 1.0;

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Muscle groups rendered on the body map (full_body is expanded onto these). */
export const BODY_MUSCLES: MuscleGroup[] = [
  'chest', 'shoulders', 'biceps', 'triceps', 'core',
  'back', 'quads', 'hamstrings', 'glutes', 'calves',
];

export type MuscleState = 'rested' | 'fresh' | 'worked' | 'fatigued';

export interface MuscleStatus {
  muscle: MuscleGroup;
  /** 0 (fully fatigued) … 100 (fully rested). */
  freshness: number;
  lastTrainedDaysAgo: number | null;
  state: MuscleState;
}

/** One training bout with the muscles it hit (built from workout sets upstream). */
export interface MuscleSession {
  trainedAt: ISODateString;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /**
   * Mobility/stretching work (exercise category 'mobility') — eases fatigue
   * instead of adding it. Doesn't update lastTrainedDaysAgo: that's reserved
   * for real training load, so "last trained" and suggestNextMuscles still
   * reflect what actually needs work, not the last time you stretched it.
   */
  recovery?: boolean;
  /**
   * Poids de la séance (1 par défaut). Une séance structurée compte pour 1 ;
   * une activité importée est pondérée par sa durée, son intensité et le poids
   * de son type — une marche de 10 min ne fatigue pas comme un semi-marathon.
   */
  load?: number;
}

function stateFor(freshness: number): MuscleState {
  if (freshness >= 85) return 'rested';
  if (freshness >= 60) return 'fresh';
  if (freshness >= 35) return 'worked';
  return 'fatigued';
}

/** Minuit local du jour de `d` — pour compter des jours calendaires, pas des tranches de 24h glissantes. */
const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Per-muscle status as of `asOf`. Sessions in the last 7 days contribute
 * fatigue weighted by role (primary 1.0, secondary 0.5, full_body 0.5 to all),
 * capped per session per muscle at `MAX_SESSION_MUSCLE_WEIGHT`, by the
 * session's `load`, and by recency (half-life 36 h).
 */
export function computeMuscleStates(sessions: MuscleSession[], asOf: ISODateString): MuscleStatus[] {
  const now = new Date(asOf);
  const nowMs = now.getTime();
  const fatigue = new Map<MuscleGroup, number>();
  const lastAgo = new Map<MuscleGroup, number>();
  const lastTrainedAt = new Map<MuscleGroup, ISODateString>();

  // Regroupe par séance réelle (même `trainedAt` = même entraînement, un
  // exercice par entrée en amont) : le plafond porte sur ce que TOUTE la
  // séance pèse sur un muscle, pas sur chaque exercice isolément — un
  // exercice seul ne dépasse jamais 1.0 (primaire) de toute façon, donc
  // plafonner exercice par exercice ne changerait rien.
  const byTrainedAt = new Map<ISODateString, MuscleSession[]>();
  for (const s of sessions) {
    const list = byTrainedAt.get(s.trainedAt) ?? [];
    list.push(s);
    byTrainedAt.set(s.trainedAt, list);
  }

  for (const [trainedAt, group] of byTrainedAt) {
    const daysAgo = (nowMs - new Date(trainedAt).getTime()) / DAY_MS;
    if (daysAgo < 0 || daysAgo > FATIGUE_WINDOW_DAYS) continue;
    const decay = Math.pow(0.5, daysAgo / FATIGUE_HALF_LIFE_DAYS);

    // Poids brut (avant plafond), côté entraînement réel et côté récupération
    // séparément — une même séance peut mélanger un exercice normal et un
    // geste de mobilité, et les deux ne jouent pas dans le même sens.
    const load = new Map<MuscleGroup, number>();
    const recovery = new Map<MuscleGroup, number>();
    const addWeight = (bucket: Map<MuscleGroup, number>, muscles: MuscleGroup[], weight: number, factor: number): void => {
      for (const m of muscles) {
        if (m === 'full_body') for (const bm of BODY_MUSCLES) bucket.set(bm, (bucket.get(bm) ?? 0) + weight * 0.5 * factor);
        else bucket.set(m, (bucket.get(m) ?? 0) + weight * factor);
      }
    };
    for (const s of group) {
      const bucket = s.recovery ? recovery : load;
      const factor = s.load ?? 1;
      addWeight(bucket, s.primaryMuscles, 1.0, factor);
      addWeight(bucket, s.secondaryMuscles, 0.5, factor);
    }

    for (const muscle of new Set([...load.keys(), ...recovery.keys()])) {
      const cappedLoad = Math.min(load.get(muscle) ?? 0, MAX_SESSION_MUSCLE_WEIGHT);
      // Récupération : plafonnée comme le reste, puis appliquée à moitié du
      // taux d'un vrai entraînement (déjà le comportement avant ce correctif).
      const cappedRecovery = Math.min(recovery.get(muscle) ?? 0, MAX_SESSION_MUSCLE_WEIGHT) * 0.5;
      fatigue.set(muscle, (fatigue.get(muscle) ?? 0) + (cappedLoad - cappedRecovery) * decay);
      if (load.has(muscle)) {
        const prev = lastAgo.get(muscle);
        if (prev === undefined || daysAgo < prev) {
          lastAgo.set(muscle, daysAgo);
          lastTrainedAt.set(muscle, trainedAt);
        }
      }
    }
  }

  const today = dayStart(now);
  return BODY_MUSCLES.map((muscle) => {
    // Clamped only here (not per-hit) so accumulation stays order-independent
    // — a recovery session can't "bank" fatigue relief past what real load
    // already added this window, but it also can't be shadowed just because
    // it happened to be processed before a real session in the input array.
    const netFatigue = Math.max(0, fatigue.get(muscle) ?? 0);
    const freshness = clamp(Math.round(100 - netFatigue * 50));
    const trainedAt = lastTrainedAt.get(muscle);
    return {
      muscle,
      freshness,
      // Différence de JOURS CALENDAIRES (minuit à minuit), pas de tranches de
      // 24h glissantes — sinon une séance d'hier soir dit encore
      // « aujourd'hui » tant que 24h pleines ne se sont pas écoulées.
      lastTrainedDaysAgo: trainedAt === undefined ? null : Math.round((today - dayStart(new Date(trainedAt))) / DAY_MS),
      state: stateFor(freshness),
    };
  });
}

/** Overall training readiness 0-100: mean freshness across all muscle groups. */
export function overallReadiness(statuses: MuscleStatus[]): number {
  if (statuses.length === 0) return 100;
  const sum = statuses.reduce((acc, s) => acc + s.freshness, 0);
  return Math.round(sum / statuses.length);
}

/** The freshest muscles (rested), useful to suggest what to train next. */
export function suggestNextMuscles(statuses: MuscleStatus[], count = 3): MuscleGroup[] {
  return [...statuses]
    .sort((a, b) => b.freshness - a.freshness)
    .slice(0, count)
    .map((s) => s.muscle);
}
