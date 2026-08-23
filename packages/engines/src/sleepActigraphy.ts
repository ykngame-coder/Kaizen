import type { Confidence, ISODateString, Reliability, SleepSegment, SleepSession, SleepStage } from '@supotsu/core';

/**
 * Phone-based sleep actigraphy (Master Prompt : « aucune boîte noire », no
 * REM/HRV possible without a watch). Pure — an aggregated movement timeline
 * in, a draft SleepSession + confidence out; no sensor access, no I/O. The
 * impure sampling (accelerometer, epoch aggregation) lives in
 * apps/mobile/src/features/sommeil/nightTracker.ts, and persistence in the
 * repository layer.
 */

/** One aggregated movement reading over a short window (default 60s — see SleepTrackingScreen). */
export interface MovementEpoch {
  t: ISODateString;
  /** Aggregated motion intensity for the epoch (e.g. max/variance of the accel vector), unitless, caller-normalized to roughly 0-1+. */
  motion: number;
}

// Thresholds are on the same 0-1-ish scale SleepTrackingScreen normalizes epochs to.
const DEEP_MOTION = 0.15;
const LIGHT_MOTION = 0.5;
/** A low-motion stretch only reads as deep sleep once it's *prolonged* — a single quiet epoch amid activity is noise, not a deep-sleep segment. */
const MIN_DEEP_RUN_EPOCHS = 3;
const DEFAULT_EPOCH_SEC = 60;

const MIN_EPOCHS_TO_CONFIRM = 20;
const MIN_EPOCHS_MEDIUM = 180;
const MIN_ASLEEP_MIN_TO_CONFIRM = 60;
const MIN_ASLEEP_MIN_MEDIUM = 180;

const CONFIDENCE_RANK: Record<Confidence, number> = { to_confirm: 0, medium: 1, high: 2 };
const worseConfidence = (a: Confidence, b: Confidence): Confidence => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a);

function rawStage(motion: number): 'deep' | 'light' | 'awake' {
  if (motion > LIGHT_MOTION) return 'awake';
  if (motion > DEEP_MOTION) return 'light';
  return 'deep';
}

/** Per-epoch raw threshold classification, then downgrade any deep run shorter than MIN_DEEP_RUN_EPOCHS to light. */
function classifyEpochs(epochs: MovementEpoch[]): SleepStage[] {
  const stages: SleepStage[] = epochs.map((e) => rawStage(e.motion));
  let i = 0;
  while (i < stages.length) {
    if (stages[i] === 'deep') {
      let j = i;
      while (j < stages.length && stages[j] === 'deep') j++;
      if (j - i < MIN_DEEP_RUN_EPOCHS) {
        for (let k = i; k < j; k++) stages[k] = 'light';
      }
      i = j;
    } else {
      i++;
    }
  }
  return stages;
}

/** Median gap between consecutive epochs, in seconds — robust to the occasional dropped sample. */
function inferEpochSec(epochs: MovementEpoch[]): number {
  if (epochs.length < 2) return DEFAULT_EPOCH_SEC;
  const deltas: number[] = [];
  for (let i = 1; i < epochs.length; i++) {
    const d = (new Date(epochs[i]!.t).getTime() - new Date(epochs[i - 1]!.t).getTime()) / 1000;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return DEFAULT_EPOCH_SEC;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]!;
}

function buildSegments(epochs: MovementEpoch[], stages: SleepStage[], epochSec: number): SleepSegment[] {
  const segments: SleepSegment[] = [];
  let i = 0;
  while (i < epochs.length) {
    let j = i;
    while (j < epochs.length && stages[j] === stages[i]) j++;
    const startedAt = epochs[i]!.t;
    const endedAt = new Date(new Date(epochs[j - 1]!.t).getTime() + epochSec * 1000).toISOString();
    segments.push({ stage: stages[i]!, startedAt, endedAt });
    i = j;
  }
  return segments;
}

function minutesByStage(segments: SleepSegment[], stage: SleepStage): number {
  return segments
    .filter((s) => s.stage === stage)
    .reduce((sum, s) => sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000, 0);
}

/**
 * Turn a night's movement timeline into a draft SleepSession + a confidence
 * level. REM is never detected from movement alone (`remMin` is always 0);
 * `reliability` is always 'low' — the method's inherent ceiling, regardless
 * of how much data came in (Master Prompt P38.10). `confidence` is the
 * per-read trust signal (little data / a short night ⇒ lower), separate
 * from that fixed method ceiling.
 */
export function analyzeSleep(
  epochs: MovementEpoch[],
  inBedStart: ISODateString,
  inBedEnd: ISODateString,
): { session: Omit<SleepSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'>; confidence: Confidence } {
  const startMs = new Date(inBedStart).getTime();
  const endMs = new Date(inBedEnd).getTime();
  const scoped = epochs
    .filter((e) => {
      const t = new Date(e.t).getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => a.t.localeCompare(b.t));

  const epochSec = inferEpochSec(scoped);
  const stages = classifyEpochs(scoped);
  const segments = buildSegments(scoped, stages, epochSec);

  const deepMin = Math.round(minutesByStage(segments, 'deep'));
  const lightMin = Math.round(minutesByStage(segments, 'light'));
  const awakeMin = Math.round(minutesByStage(segments, 'awake'));
  const remMin = 0;
  const asleepMin = deepMin + lightMin;
  const inBedMin = Math.max(0, Math.round((endMs - startMs) / 60_000));

  const coverageLevel: Confidence =
    scoped.length < MIN_EPOCHS_TO_CONFIRM ? 'to_confirm' : scoped.length < MIN_EPOCHS_MEDIUM ? 'medium' : 'high';
  const durationLevel: Confidence =
    asleepMin < MIN_ASLEEP_MIN_TO_CONFIRM ? 'to_confirm' : asleepMin < MIN_ASLEEP_MIN_MEDIUM ? 'medium' : 'high';
  const confidence = worseConfidence(coverageLevel, durationLevel);

  return {
    session: {
      source: 'phone',
      reliability: 'low',
      startedAt: inBedStart,
      endedAt: inBedEnd,
      deepMin,
      lightMin,
      remMin,
      awakeMin,
      asleepMin,
      inBedMin,
      segments: segments.length > 0 ? segments : undefined,
    },
    confidence,
  };
}

/**
 * Is the user currently in light sleep or stirring near wake — the smart
 * alarm's trigger signal within its window (spec: « léger/proche du
 * réveil »)? False only for a *sustained* still stretch (deep sleep); an
 * isolated quiet blip at the tail still smooths to light, same as
 * `analyzeSleep`'s segmentation, so both stay consistent.
 */
export function isLightSleep(recentEpochs: MovementEpoch[]): boolean {
  if (recentEpochs.length === 0) return false;
  const stages = classifyEpochs(recentEpochs);
  return stages[stages.length - 1] !== 'deep';
}

/** Local (device-timezone) calendar-day key — a night is dated by its wake time ("the night of the 14th" = waking up on the 14th). */
export function nightDateKey(iso: ISODateString): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RELIABILITY_RANK: Record<Reliability, number> = { low: 0, medium: 1, high: 2 };

/**
 * Anti-doublon: `sleep_sessions`'s unique index is (user, started_at,
 * source), so a phone-tracked night doesn't collide at the DB level with an
 * imported watch night for the same date — that has to be app-layer logic.
 * One session per calendar night: insert only when strictly more reliable
 * than everything already recorded for that night (an absent reliability on
 * an existing session is treated as trustworthy, never silently overridden).
 */
export function resolveSleepSessionInsert(
  existingSameNight: Pick<SleepSession, 'reliability'>[] | undefined,
  candidateReliability: Reliability,
): 'insert' | 'skip' {
  if (!existingSameNight || existingSameNight.length === 0) return 'insert';
  const bestExisting = Math.max(...existingSameNight.map((s) => RELIABILITY_RANK[s.reliability ?? 'high']));
  return RELIABILITY_RANK[candidateReliability] > bestExisting ? 'insert' : 'skip';
}
