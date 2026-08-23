import type { Confidence, HealthMetric, ISODateString, SleepSession } from '@supotsu/core';
import type { EngineResult, Explanation, I18nText } from './result';
import { computeRecoveryScore } from './recovery';

/**
 * Sleep Engine (Master Prompt P14 sommeil). Turns imported sleep metrics
 * (duration + efficiency) into an explainable Sleep Score and a weekly trend.
 * Pure — health metrics in, provenance-aware results out. Complements the
 * Recovery Engine, which also reads sleep but blends it with HRV/RHR/stress.
 */

const DAY_MS = 86_400_000;
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Recommended nightly sleep, in hours (Master Prompt P14.4). */
export const SLEEP_TARGET_HOURS = 8;

function within(m: HealthMetric, asOf: ISODateString, days: number): boolean {
  const age = (new Date(asOf).getTime() - new Date(m.measuredAt).getTime()) / DAY_MS;
  return age >= 0 && age < days;
}

function latest(
  metrics: HealthMetric[],
  type: HealthMetric['type'],
  asOf: ISODateString,
  days = 2,
): number | undefined {
  const candidates = metrics
    .filter((m) => m.type === type && within(m, asOf, days))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  return candidates[0]?.value;
}

/** Score a single night's duration: 8h ⇒ 100, linear to 0 at 4h, capped. */
function durationScore(hours: number): number {
  return clamp(((hours - 4) / (SLEEP_TARGET_HOURS - 4)) * 100);
}

export type SleepBand = 'excellent' | 'correct' | 'moyen' | 'faible';

export function sleepBand(score: number): SleepBand {
  if (score >= 85) return 'excellent';
  if (score >= 60) return 'correct';
  if (score >= 40) return 'moyen';
  return 'faible';
}

/**
 * Sleep Score 0-100 from the most recent night. Duration is weighted most;
 * efficiency (time asleep vs in bed) refines it when available. Confidence
 * reflects how many components backed the score.
 *
 * @deprecated Superseded by {@link computeSleepScore2} (adds régularité,
 * dette de sommeil and récupération) — kept only for its existing tests.
 * New code should use computeSleepScore2 / {@link sleepCoaching}.
 */
export function computeSleepScore(
  metrics: HealthMetric[],
  asOf: ISODateString,
): EngineResult<number> {
  const parts: { value: number; weight: number }[] = [];

  const hours = latest(metrics, 'sleep_duration', asOf);
  if (hours !== undefined) parts.push({ value: durationScore(hours), weight: 0.65 });

  const efficiency = latest(metrics, 'sleep_efficiency', asOf);
  if (efficiency !== undefined) parts.push({ value: clamp(efficiency), weight: 0.35 });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const value =
    totalWeight > 0
      ? clamp(Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight))
      : 0;

  let confidence: Confidence = 'to_confirm';
  if (parts.length >= 2) confidence = 'high';
  else if (parts.length === 1) confidence = 'medium';

  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

export interface SleepNight {
  date: ISODateString;
  hours: number;
  score: number;
}

/** Per-night duration + score over the last `days`, most recent first. */
export function sleepTrend(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): SleepNight[] {
  return metrics
    .filter((m) => m.type === 'sleep_duration' && within(m, asOf, days))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .map((m) => ({ date: m.measuredAt, hours: m.value, score: Math.round(durationScore(m.value)) }));
}

/** Mean nightly hours over `days`, or undefined when no nights are logged. */
export function averageSleepHours(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): number | undefined {
  const nights = metrics.filter((m) => m.type === 'sleep_duration' && within(m, asOf, days));
  if (nights.length === 0) return undefined;
  return nights.reduce((s, m) => s + m.value, 0) / nights.length;
}

/**
 * Explainable sleep briefing (Master Prompt P14.6), or undefined without data.
 * @deprecated Built on the deprecated {@link computeSleepScore}. Use {@link sleepCoaching}, which is built on Score 2.0.
 */
export function sleepExplanation(
  metrics: HealthMetric[],
  asOf: ISODateString,
): Explanation | undefined {
  const score = computeSleepScore(metrics, asOf);
  if (score.confidence === 'to_confirm') return undefined;
  const hours = latest(metrics, 'sleep_duration', asOf);
  const band = sleepBand(score.value);
  const actionKey: Record<SleepBand, string> = {
    excellent: 'engines.sleep.score.action.excellent',
    correct: 'engines.sleep.score.action.correct',
    moyen: 'engines.sleep.score.action.moyen',
    faible: 'engines.sleep.score.action.faible',
  };
  return {
    observation:
      hours !== undefined
        ? { key: `engines.sleep.score.observation.withHours.${band}`, params: { score: score.value, hours: hours.toFixed(1) } }
        : { key: `engines.sleep.score.observation.${band}`, params: { score: score.value } },
    analysis: { key: 'engines.sleep.score.analysis' },
    action: { key: actionKey[band] },
  };
}

// ---------------------------------------------------------------------------
// Sleep Score 2.0 — composite, decomposed, explainable (Sleep Suite, cahier
// des charges §3.10). Each component is scored 0-100 and carries its own
// weight, availability and one-line rationale so nothing is a "black box"
// (explicabilité obligatoire). Only the components actually backed by data
// contribute; weights renormalize over what's present. All computed from the
// metrics we already ingest (Garmin / Apple Santé) — no extra hardware.
// ---------------------------------------------------------------------------

/** Beyond this spread in bedtimes, regularity is treated as fully irregular. */
const REGULARITY_TOLERANCE_MIN = 90;
/**
 * Sleep debt looks back 3 months rather than the 7-day window used for
 * regularity: a single "bad week" is noise, but a sustained shortfall over a
 * season is the kind of chronic debt that actually matters and is worth
 * surfacing on its own timeline, independent of `windowDays`.
 */
const DEBT_WINDOW_DAYS = 90;
/** A full night's deficit *per week*, sustained across the debt window, maps sleep debt to a score of 0 — same severity bar as before, just extended to the longer window. */
const DEBT_CAP_HOURS = SLEEP_TARGET_HOURS * (DEBT_WINDOW_DAYS / 7);
/** Minimum nights required before regularity / debt are meaningful. */
const MIN_NIGHTS_FOR_TREND = 3;

export type SleepComponentKey = 'quantity' | 'quality' | 'regularity' | 'debt' | 'recovery';

export interface SleepScoreComponent {
  key: SleepComponentKey;
  /** User-facing name (French). */
  label: string;
  /** 0-100, or null when the backing data is missing (shown as such, not zeroed). */
  value: number | null;
  /** Relative weight in the global score; applies only when `value` is present. */
  weight: number;
  /** One-line, user-facing explanation of what this component reflects. */
  detail: string;
}

export interface SleepScore2Result extends EngineResult<number> {
  components: SleepScoreComponent[];
}

const COMPONENT_LABEL: Record<SleepComponentKey, string> = {
  quantity: 'Quantité',
  quality: 'Qualité',
  regularity: 'Régularité',
  debt: 'Dette',
  recovery: 'Récupération',
};

const COMPONENT_WEIGHT: Record<SleepComponentKey, number> = {
  quantity: 0.3,
  quality: 0.2,
  regularity: 0.2,
  debt: 0.15,
  recovery: 0.15,
};

/** Bedtimes (measuredAt of each sleep_duration night) within the window, minutes-of-day. */
function bedtimeMinutes(metrics: HealthMetric[], asOf: ISODateString, days: number): number[] {
  return metrics
    .filter((m) => m.type === 'sleep_duration' && within(m, asOf, days))
    .map((m) => {
      const d = new Date(m.measuredAt);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    });
}

/**
 * Circular standard deviation of bedtimes, in minutes. Treating the clock as a
 * circle handles the midnight wrap (23:50 and 00:10 are 20 min apart, not 23h).
 * Offset-invariant, so UTC vs local time doesn't change the result.
 */
export function bedtimeSpreadMinutes(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): number | undefined {
  const mins = bedtimeMinutes(metrics, asOf, days);
  if (mins.length < MIN_NIGHTS_FOR_TREND) return undefined;
  const twoPi = Math.PI * 2;
  let sumCos = 0;
  let sumSin = 0;
  for (const m of mins) {
    const theta = (m / 1440) * twoPi;
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  const r = Math.sqrt(sumCos * sumCos + sumSin * sumSin) / mins.length;
  if (r < 1e-6) return 1440 / 4; // maximal dispersion
  const sdRad = Math.sqrt(-2 * Math.log(r));
  return (sdRad * 1440) / twoPi;
}

/** Regularity 0-100 from bedtime spread: identical times ⇒ 100, ≥90 min ⇒ 0. */
function regularityScore(spreadMin: number): number {
  return clamp(100 - (spreadMin / REGULARITY_TOLERANCE_MIN) * 100);
}

/**
 * Cumulative sleep debt (hours) over the logged nights in the window — the sum
 * of nightly shortfalls below the target. Only counts nights we actually have,
 * so missing nights don't invent debt.
 */
export function sleepDebtHours(
  metrics: HealthMetric[],
  asOf: ISODateString,
  days = 7,
): { debt: number; nights: number } {
  const nights = metrics.filter((m) => m.type === 'sleep_duration' && within(m, asOf, days));
  const debt = nights.reduce((s, m) => s + Math.max(0, SLEEP_TARGET_HOURS - m.value), 0);
  return { debt: Number(debt.toFixed(1)), nights: nights.length };
}

/** Sleep debt 0-100: no shortfall ⇒ 100, a full night behind (8h) ⇒ 0. */
function debtScore(debtHours: number): number {
  return clamp(100 - (debtHours / DEBT_CAP_HOURS) * 100);
}

/**
 * Sleep Score 2.0 — a composite of up to five explainable components computed
 * from the data on hand. The returned `components` array always lists all five
 * (in a stable order) with `value: null` for those lacking data, so the UI can
 * show what's missing and what's needed. The headline `value` is the weighted
 * mean over the *available* components (weights renormalized).
 */
/** Healthy adult stage references, as a fraction of time asleep (§3.10). */
export const DEEP_TARGET_PCT = 0.15;
export const REM_TARGET_PCT = 0.22;

export interface PhaseQuality {
  score: number;
  deepPct: number;
  remPct: number;
  efficiencyPct: number;
}

/**
 * Phase-based sleep quality (§3.10) — an *explainable* score from the real stage
 * composition of a night: enough deep sleep, enough REM, high efficiency. Each
 * sub-score is capped at 100 (more than the reference isn't penalized). Falls to
 * the caller to use `sleep_efficiency` when no session with stages is available.
 */
export function sleepPhaseQuality(session: SleepSession): PhaseQuality | null {
  const asleep = session.asleepMin;
  if (!(asleep > 0)) return null;
  const deepPct = session.deepMin / asleep;
  const remPct = session.remMin / asleep;
  const efficiencyPct = session.inBedMin > 0 ? clamp((asleep / session.inBedMin) * 100) : 100;
  const deepScore = clamp((deepPct / DEEP_TARGET_PCT) * 100);
  const remScore = clamp((remPct / REM_TARGET_PCT) * 100);
  const score = Math.round(0.35 * deepScore + 0.3 * remScore + 0.35 * efficiencyPct);
  return {
    score,
    deepPct: Math.round(deepPct * 100),
    remPct: Math.round(remPct * 100),
    efficiencyPct: Math.round(efficiencyPct),
  };
}

/** The most recent sleep session at/before `asOf`, or undefined. */
function latestSession(
  sessions: SleepSession[] | undefined,
  asOf: ISODateString,
): SleepSession | undefined {
  if (!sessions?.length) return undefined;
  const cutoff = new Date(asOf).getTime();
  return sessions
    .filter((s) => new Date(s.startedAt).getTime() <= cutoff)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export function computeSleepScore2(
  metrics: HealthMetric[],
  asOf: ISODateString,
  windowDays = 7,
  sessions?: SleepSession[],
): SleepScore2Result {
  const components: SleepScoreComponent[] = [];

  // 1) Quantité — last night's duration vs the 8h target.
  const hours = latest(metrics, 'sleep_duration', asOf);
  components.push({
    key: 'quantity',
    label: COMPONENT_LABEL.quantity,
    weight: COMPONENT_WEIGHT.quantity,
    value: hours !== undefined ? Math.round(durationScore(hours)) : null,
    detail:
      hours !== undefined
        ? `${hours.toFixed(1)} h dormies sur ${SLEEP_TARGET_HOURS} h visées.`
        : 'Nécessite une nuit enregistrée (toute source).',
  });

  // 2) Qualité — the real stage composition when a sleep session is available
  //    (deep %, REM %, efficiency); otherwise fall back to the device efficiency
  //    metric. Both paths are surfaced honestly in the detail line.
  const session = latestSession(sessions, asOf);
  const phase = session ? sleepPhaseQuality(session) : null;
  const efficiency = latest(metrics, 'sleep_efficiency', asOf);
  const qualityValue =
    phase !== null
      ? phase.score
      : efficiency !== undefined
        ? Math.round(clamp(efficiency))
        : null;
  components.push({
    key: 'quality',
    label: COMPONENT_LABEL.quality,
    weight: COMPONENT_WEIGHT.quality,
    value: qualityValue,
    detail:
      phase !== null
        ? `Profond ${phase.deepPct}%, paradoxal ${phase.remPct}%, efficacité ${phase.efficiencyPct}%.`
        : efficiency !== undefined
          ? `Basé sur le score de sommeil de ton appareil (${Math.round(efficiency)}/100).`
          : 'Nécessite les phases de sommeil ou une efficacité (selon la source).',
  });

  // 3) Régularité — how consistent bedtimes are across the window.
  const spread = bedtimeSpreadMinutes(metrics, asOf, windowDays);
  components.push({
    key: 'regularity',
    label: COMPONENT_LABEL.regularity,
    weight: COMPONENT_WEIGHT.regularity,
    value: spread !== undefined ? Math.round(regularityScore(spread)) : null,
    detail:
      spread !== undefined
        ? `Heure de coucher à ±${Math.round(spread)} min sur ${windowDays} nuits.`
        : `Nécessite au moins ${MIN_NIGHTS_FOR_TREND} nuits enregistrées.`,
  });

  // 4) Dette — cumulative shortfall over the last 3 months (its own window,
  //    independent of windowDays — see DEBT_WINDOW_DAYS above).
  const { debt, nights } = sleepDebtHours(metrics, asOf, DEBT_WINDOW_DAYS);
  components.push({
    key: 'debt',
    label: COMPONENT_LABEL.debt,
    weight: COMPONENT_WEIGHT.debt,
    value: nights >= MIN_NIGHTS_FOR_TREND ? Math.round(debtScore(debt)) : null,
    detail:
      nights >= MIN_NIGHTS_FOR_TREND
        ? debt > 0
          ? `−${debt.toFixed(1)} h cumulées sur ${nights} nuits (3 derniers mois).`
          : `Aucune dette sur ${nights} nuits (3 derniers mois).`
        : `Nécessite au moins ${MIN_NIGHTS_FOR_TREND} nuits enregistrées.`,
  });

  // 5) Récupération — reuse the Recovery Engine, but only when a physiological
  //    signal is present (HRV / resting HR / stress); otherwise it would just
  //    re-count sleep duration, which the Quantité component already covers.
  const recovery = computeRecoveryScore(metrics, asOf);
  const hasRecoverySignal =
    latest(metrics, 'hrv', asOf) !== undefined ||
    latest(metrics, 'resting_heart_rate', asOf) !== undefined ||
    latest(metrics, 'stress', asOf) !== undefined;
  const hasRecovery = hasRecoverySignal && recovery.confidence !== 'to_confirm';
  components.push({
    key: 'recovery',
    label: COMPONENT_LABEL.recovery,
    weight: COMPONENT_WEIGHT.recovery,
    value: hasRecovery ? recovery.value : null,
    detail: hasRecovery
      ? 'HRV, fréquence cardiaque de repos et stress.'
      : 'Nécessite HRV / FC de repos.',
  });

  const available = components.filter(
    (c): c is SleepScoreComponent & { value: number } => c.value !== null && Number.isFinite(c.value),
  );
  const totalWeight = available.reduce((s, c) => s + c.weight, 0);
  const raw =
    totalWeight > 0
      ? clamp(Math.round(available.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight))
      : 0;
  const value = Number.isFinite(raw) ? raw : 0;

  let confidence: Confidence = 'to_confirm';
  if (available.length >= 4) confidence = 'high';
  else if (available.length >= 2) confidence = 'medium';

  return { value, confidence, components, sourcesUsed: ['supotsu'], generatedAt: asOf };
}

// ---------------------------------------------------------------------------
// Sleep Coaching Engine (cahier des charges §3.5). Natural-language layer over
// the Score 2.0 components: name the 1-2 dominant weak factors and give one
// concrete action. Strict rule: links are framed as *observed correlations*,
// never as absolute causal certainties.
// ---------------------------------------------------------------------------

/** One concrete, prudent action per weak component (the action line). */
const COACHING_ACTION_KEY: Record<SleepComponentKey, string> = {
  quantity: 'engines.sleep.coaching.action.quantity',
  quality: 'engines.sleep.coaching.action.quality',
  regularity: 'engines.sleep.coaching.action.regularity',
  debt: 'engines.sleep.coaching.action.debt',
  recovery: 'engines.sleep.coaching.action.recovery',
};

/** Below this, a component is considered a weak link worth coaching on. */
const WEAK_THRESHOLD = 70;

/**
 * Explainable sleep coaching from the Score 2.0 breakdown. Returns undefined
 * when there isn't enough data. Picks the up-to-two lowest available components
 * under the weak threshold as the dominant factors, and the single most concrete
 * action for the weakest one.
 */
export function sleepCoaching(
  metrics: HealthMetric[],
  asOf: ISODateString,
): Explanation | undefined {
  const s = computeSleepScore2(metrics, asOf);
  if (s.confidence === 'to_confirm') return undefined;

  const band = sleepBand(s.value);
  const observation: I18nText = { key: `engines.sleep.coaching.observation.${band}`, params: { score: s.value } };

  const weak = s.components
    .filter((c): c is SleepScoreComponent & { value: number } => c.value !== null)
    .filter((c) => c.value < WEAK_THRESHOLD)
    .sort((a, b) => a.value - b.value)
    .slice(0, 2);

  if (weak.length === 0) {
    return {
      observation,
      analysis: { key: 'engines.sleep.coaching.allGood.analysis' },
      action: { key: 'engines.sleep.coaching.allGood.action' },
    };
  }

  // The dominant weak factor(s) drive `action` precisely (COACHING_ACTION_KEY,
  // one specific key); `analysis` stays generic rather than naming each factor
  // inline — see predictionExplanation's comment on why nested-translation
  // composition (joining several already-translated fragments into one more
  // sentence) isn't done via plain i18next interpolation.
  const weakest = weak[0]!; // non-empty: the length === 0 case returned above
  return {
    observation,
    analysis: { key: weak.length > 1 ? 'engines.sleep.coaching.weak.analysis.multi' : 'engines.sleep.coaching.weak.analysis.single' },
    action: { key: COACHING_ACTION_KEY[weakest.key] },
  };
}
