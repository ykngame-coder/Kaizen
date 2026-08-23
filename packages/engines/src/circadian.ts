import type { Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';
import { SLEEP_TARGET_HOURS } from './sleep';

/**
 * Circadian Engine (Sleep Suite, cahier des charges §3.2). Derives a personal
 * chronotype and optimal-timing recommendations from sleep history alone — no
 * extra hardware. Each sleep night gives us a bedtime (the metric's measuredAt)
 * and a wake time (bedtime + duration), which is enough to estimate habitual
 * rhythm, social jetlag and light/caffeine/meal/training windows.
 *
 * Chronobiology-inspired (à la Rise) but with our own logic — no third-party
 * code or identity. All times are computed in the user's LOCAL time via an
 * optional tz offset; recommendations are framed as guidance, never medical
 * claims (P18 explicability, cahier §4.2/§4.3).
 */

const DAY_MS = 86_400_000;
const TWO_PI = Math.PI * 2;

/** Nights below this can't establish a habit; the profile stays to_confirm. */
const MIN_NIGHTS = 4;
/** Chronotype thresholds on mean mid-sleep, in local minutes-of-day. */
const CHRONOTYPE_EARLY_MAX = 3 * 60 + 30; // < 03:30 ⇒ précoce
const CHRONOTYPE_LATE_MIN = 4 * 60 + 30; // > 04:30 ⇒ tardif

export type Chronotype = 'précoce' | 'intermédiaire' | 'tardif';

export interface CircadianRecommendation {
  key: 'caffeine' | 'meal' | 'training' | 'light';
  label: string;
  /** A local time "HH:MM" or a window "HH:MM–HH:MM". */
  value: string;
  detail: string;
}

export interface EnergyPoint {
  /** Local time "HH:MM". */
  time: string;
  /** 0-1 relative alertness level — not an absolute unit, just shape. */
  energy: number;
  kind?: 'peak' | 'dip';
  label?: string;
}

export interface CircadianProfile {
  chronotype: Chronotype;
  /** Habitual local times, averaged over the window. */
  habitualBedtime: string;
  habitualWake: string;
  /** Suggested times to hit the sleep target while keeping the habitual wake. */
  idealBedtime: string;
  idealWake: string;
  /** Weekday↔weekend mid-sleep gap in minutes, or null when not computable. */
  socialJetlagMin: number | null;
  nights: number;
  recommendations: CircadianRecommendation[];
  /** Alertness across the waking day (wake → ideal bedtime), for the wavy timeline. */
  energyCurve: EnergyPoint[];
}

export type CircadianResult = EngineResult<CircadianProfile | null>;

export interface CircadianOptions {
  /** Minutes to add to UTC to get the user's local time (e.g. +120 for UTC+2). */
  tzOffsetMinutes?: number;
  windowDays?: number;
}

const clampMin = (m: number): number => ((Math.round(m) % 1440) + 1440) % 1440;

function hhmm(min: number): string {
  const m = clampMin(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Circular mean of clock times (minutes-of-day), handling the midnight wrap. */
function circularMeanMin(mins: number[]): number | undefined {
  if (mins.length === 0) return undefined;
  let c = 0;
  let s = 0;
  for (const m of mins) {
    const t = (m / 1440) * TWO_PI;
    c += Math.cos(t);
    s += Math.sin(t);
  }
  let ang = Math.atan2(s / mins.length, c / mins.length);
  if (ang < 0) ang += TWO_PI;
  return (ang * 1440) / TWO_PI;
}

/** Shortest distance between two clock times, in minutes (0..720). */
function circularDiffMin(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

interface Night {
  bedMin: number; // local minutes-of-day at sleep onset
  wakeMin: number;
  midMin: number;
  weekend: boolean; // bedtime falls on Fri or Sat (free-day nights)
}

function nightsInWindow(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days: number,
  tz: number,
): Night[] {
  const now = new Date(asOf).getTime();
  return metrics
    .filter((m) => {
      if (m.type !== 'sleep_duration') return false;
      const age = (now - new Date(m.measuredAt).getTime()) / DAY_MS;
      return age >= 0 && age < days;
    })
    .map((m) => {
      const local = new Date(new Date(m.measuredAt).getTime() + tz * 60_000);
      const t = local.getUTCHours() * 60 + local.getUTCMinutes();
      const durMin = m.value * 60;
      const day = local.getUTCDay(); // 0 Sun .. 6 Sat
      // `measured_at` can be the bedtime (sleepStart) or the wake time (sleepEnd)
      // depending on the source. Disambiguate by time of day: an evening/night
      // stamp is a bedtime; a daytime stamp is a wake time (bed = wake − duration).
      const isEveningStamp = t >= 18 * 60 || t < 3 * 60;
      const bedMin = isEveningStamp ? t : clampMin(t - durMin);
      return {
        bedMin,
        wakeMin: clampMin(bedMin + durMin),
        midMin: clampMin(bedMin + durMin / 2),
        weekend: day === 5 || day === 6,
      };
    });
}

function chronotypeOf(midMin: number): Chronotype {
  if (midMin < CHRONOTYPE_EARLY_MAX) return 'précoce';
  if (midMin > CHRONOTYPE_LATE_MIN) return 'tardif';
  return 'intermédiaire';
}

function buildRecommendations(idealBedMin: number, wakeMin: number): CircadianRecommendation[] {
  const trainStart = clampMin(wakeMin + 8 * 60);
  const trainEnd = clampMin(wakeMin + 10 * 60);
  return [
    {
      key: 'light',
      label: 'Lumière du matin',
      value: `dès ${hhmm(wakeMin)}`,
      detail: "Expose-toi à la lumière dans l'heure après ton réveil : ça cale ton horloge interne.",
    },
    {
      key: 'caffeine',
      label: 'Dernière caféine',
      value: `avant ${hhmm(idealBedMin - 8 * 60)}`,
      detail: 'La caféine agit ~8 h ; au-delà, elle fragmente le sommeil même sans que tu le sentes.',
    },
    {
      key: 'meal',
      label: 'Dernier repas',
      value: `avant ${hhmm(idealBedMin - 3 * 60)}`,
      detail: 'Finir de digérer avant le coucher facilite un endormissement plus profond.',
    },
    {
      key: 'training',
      label: 'Fenêtre sport idéale',
      value: `${hhmm(trainStart)}–${hhmm(trainEnd)}`,
      detail: 'La performance est souvent maximale en fin d’après-midi ; évite l’intensité juste avant le coucher.',
    },
  ];
}

/**
 * Shape of a typical biphasic alertness curve, as hours-since-wake control
 * points (chronobiology's well-known "two peaks, one afternoon dip" pattern
 * — morning peak a few hours after waking, a post-lunch dip, a smaller
 * evening peak, then a decline toward bedtime). Energy is 0-1 (shape only,
 * not an absolute unit). Interpolated with a cosine ease between points so
 * the rendered line is an actual wave, not a jagged connect-the-dots.
 */
const ENERGY_CURVE_SHAPE: { hoursSinceWake: number; energy: number; kind?: 'peak' | 'dip'; label?: string }[] = [
  { hoursSinceWake: 0, energy: 0.35 },
  { hoursSinceWake: 1.5, energy: 0.62 },
  { hoursSinceWake: 3.5, energy: 0.95, kind: 'peak', label: 'Pic du matin' },
  { hoursSinceWake: 5.5, energy: 0.72 },
  { hoursSinceWake: 8, energy: 0.42, kind: 'dip', label: 'Creux de l’après-midi' },
  { hoursSinceWake: 10, energy: 0.68 },
  { hoursSinceWake: 11.5, energy: 0.85, kind: 'peak', label: 'Second pic (soirée)' },
  { hoursSinceWake: 14, energy: 0.5 },
];

/** Control points scaled to the user's actual wake time and waking-day length. */
function buildEnergyCurve(wakeMin: number, bedMin: number): EnergyPoint[] {
  const awakeHours = clampMin(bedMin - wakeMin) / 60 || 16;
  const points = ENERGY_CURVE_SHAPE.filter((p) => p.hoursSinceWake < awakeHours).map((p) => ({
    time: hhmm(wakeMin + p.hoursSinceWake * 60),
    energy: p.energy,
    kind: p.kind,
    label: p.label,
  }));
  // Anchor the last point at bedtime itself — low energy, no marker.
  points.push({ time: hhmm(bedMin), energy: 0.22, kind: undefined, label: undefined });
  return points;
}

/**
 * Compute the user's circadian profile. Returns a null value with `to_confirm`
 * confidence when there aren't enough nights to establish a habit.
 */
export function computeCircadianProfile(
  metrics: HealthMetric[],
  asOf: ISODateString,
  options: CircadianOptions = {},
): CircadianResult {
  const tz = options.tzOffsetMinutes ?? 0;
  const windowDays = options.windowDays ?? 30;
  const nights = nightsInWindow(metrics, asOf, windowDays, tz);

  if (nights.length < MIN_NIGHTS) {
    return { value: null, confidence: 'to_confirm', sourcesUsed: ['supotsu'], generatedAt: asOf };
  }

  const habitualBedMin = circularMeanMin(nights.map((n) => n.bedMin))!;
  const habitualWakeMin = circularMeanMin(nights.map((n) => n.wakeMin))!;
  const midMin = circularMeanMin(nights.map((n) => n.midMin))!;

  // Keep the habitual wake; back out a bedtime that hits the sleep target.
  const idealWakeMin = habitualWakeMin;
  const idealBedMin = clampMin(idealWakeMin - SLEEP_TARGET_HOURS * 60);

  const weekMid = circularMeanMin(nights.filter((n) => !n.weekend).map((n) => n.midMin));
  const endMid = circularMeanMin(nights.filter((n) => n.weekend).map((n) => n.midMin));
  const socialJetlagMin =
    weekMid !== undefined && endMid !== undefined
      ? Math.round(circularDiffMin(weekMid, endMid))
      : null;

  const chronotype = chronotypeOf(midMin);

  const profile: CircadianProfile = {
    chronotype,
    habitualBedtime: hhmm(habitualBedMin),
    habitualWake: hhmm(habitualWakeMin),
    idealBedtime: hhmm(idealBedMin),
    idealWake: hhmm(idealWakeMin),
    socialJetlagMin,
    nights: nights.length,
    recommendations: buildRecommendations(idealBedMin, habitualWakeMin),
    energyCurve: buildEnergyCurve(habitualWakeMin, idealBedMin),
  };

  const confidence: Confidence = nights.length >= 7 ? 'high' : 'medium';

  return {
    value: profile,
    confidence,
    explanation: circadianExplanation(profile),
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

const CHRONOTYPE_OBSERVATION_KEY: Record<Chronotype, string> = {
  précoce: 'engines.circadian.profile.observation.early',
  intermédiaire: 'engines.circadian.profile.observation.intermediate',
  tardif: 'engines.circadian.profile.observation.late',
};

/** Explainable headline for the circadian profile (Observation → Analyse → Action). */
export function circadianExplanation(profile: CircadianProfile): Explanation {
  return {
    observation: {
      key: CHRONOTYPE_OBSERVATION_KEY[profile.chronotype],
      params: { bedtime: profile.habitualBedtime, wake: profile.habitualWake },
    },
    analysis:
      profile.socialJetlagMin !== null
        ? { key: 'engines.circadian.profile.analysis.jetlag', params: { jetlagMin: profile.socialJetlagMin } }
        : { key: 'engines.circadian.profile.analysis.nights', params: { nights: profile.nights } },
    action: {
      key: 'engines.circadian.profile.action',
      params: { hours: SLEEP_TARGET_HOURS, bedtime: profile.idealBedtime, wake: profile.idealWake },
    },
  };
}
