import type { Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { EngineResult, Explanation, I18nText } from './result';
import { computeRecoveryScore } from './recovery';
import { averageSleepHours, bedtimeSpreadMinutes, sleepDebtHours } from './sleep';

/**
 * Sleep Prediction Engine (Sleep Suite, cahier des charges §3.9). Estimates the
 * next day's energy and fatigue risk from the recent trajectory: today's
 * recovery, accumulated sleep debt, schedule regularity and training load
 * (ACWR). Pure — no extra hardware.
 *
 * Strict framing (cahier §4.2/§4.3, P18): this is an *estimation* of a
 * probability, never a certainty; the drivers are correlations, not diagnoses.
 */

const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

/** Penalties are capped so no single factor dominates the estimate. */
const DEBT_PENALTY_PER_HOUR = 2.5;
const DEBT_PENALTY_CAP = 20;
const IRREGULAR_SPREAD_MIN = 60;
const IRREGULAR_PENALTY = 6;
const ACWR_HIGH = 1.3;
const ACWR_PENALTY_CAP = 15;

export type FatigueRisk = 'faible' | 'modéré' | 'élevé';

export interface SleepPrediction {
  /** Predicted next-day energy, 0-100. */
  energyScore: number;
  fatigueRisk: FatigueRisk;
  /** Factors that shaped the estimate, most important first. */
  drivers: I18nText[];
}

export type SleepPredictionResult = EngineResult<SleepPrediction | null>;

export interface PredictionOptions {
  /** Acute:chronic workload ratio from the Load Engine, if available. */
  acwr?: number | null;
  windowDays?: number;
}

function riskFromScore(score: number): FatigueRisk {
  if (score >= 70) return 'faible';
  if (score >= 45) return 'modéré';
  return 'élevé';
}

function bumpRisk(risk: FatigueRisk): FatigueRisk {
  if (risk === 'faible') return 'modéré';
  if (risk === 'modéré') return 'élevé';
  return 'élevé';
}

/**
 * Predict next-day energy and fatigue risk. Returns a null value with
 * `to_confirm` confidence when today's recovery can't be established (no HRV /
 * resting-HR / sleep to anchor the estimate). Confidence is capped at 'medium'
 * because a forecast is inherently uncertain.
 */
export function predictNextDayEnergy(
  metrics: HealthMetric[],
  asOf: ISODateString,
  options: PredictionOptions = {},
): SleepPredictionResult {
  const windowDays = options.windowDays ?? 7;
  const recovery = computeRecoveryScore(metrics, asOf);
  if (recovery.confidence === 'to_confirm') {
    return { value: null, confidence: 'to_confirm', sourcesUsed: ['supotsu'], generatedAt: asOf };
  }

  const drivers: I18nText[] = [];
  let score = recovery.value;

  const { debt } = sleepDebtHours(metrics, asOf, windowDays);
  if (debt > 0) {
    const penalty = Math.min(DEBT_PENALTY_CAP, debt * DEBT_PENALTY_PER_HOUR);
    score -= penalty;
    if (debt >= 2) drivers.push({ key: 'engines.prediction.driver.sleepDebt', params: { debt: debt.toFixed(1), windowDays } });
  }

  const spread = bedtimeSpreadMinutes(metrics, asOf, windowDays);
  if (spread !== undefined && spread > IRREGULAR_SPREAD_MIN) {
    score -= IRREGULAR_PENALTY;
    drivers.push({ key: 'engines.prediction.driver.irregularBedtime' });
  }

  const acwr = options.acwr ?? null;
  let highLoad = false;
  if (acwr !== null && acwr > ACWR_HIGH) {
    const penalty = Math.min(ACWR_PENALTY_CAP, (acwr - ACWR_HIGH) * 30);
    score -= penalty;
    highLoad = acwr > 1.5;
    drivers.push({ key: 'engines.prediction.driver.risingLoad' });
  }

  const avg = averageSleepHours(metrics, asOf, windowDays);
  if (drivers.length === 0) {
    drivers.push({ key: recovery.value >= 70 ? 'engines.prediction.driver.goodRecovery' : 'engines.prediction.driver.stableRecovery' });
  }

  const energyScore = clamp(Math.round(score));
  let fatigueRisk = riskFromScore(energyScore);
  if (highLoad) fatigueRisk = bumpRisk(fatigueRisk);

  const prediction: SleepPrediction = { energyScore, fatigueRisk, drivers };

  // A forecast never claims high certainty.
  const confidence: Confidence = recovery.confidence === 'high' ? 'medium' : recovery.confidence;

  return {
    value: prediction,
    confidence,
    explanation: predictionExplanation(prediction, avg),
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}

const RISK_ACTION_KEY: Record<FatigueRisk, string> = {
  faible: 'engines.prediction.action.low',
  modéré: 'engines.prediction.action.moderate',
  élevé: 'engines.prediction.action.high',
};

/**
 * Explainable forecast (Observation → Analyse → Action), framed as an
 * estimation. `analysis` intentionally doesn't embed the top driver's text
 * inline (that would require translating a nested I18nText *inside* another
 * translated string, which plain i18next interpolation can't do) — the UI
 * renders `prediction.drivers[0]` alongside the analysis sentence instead.
 */
export function predictionExplanation(
  prediction: SleepPrediction,
  avgSleepHours?: number,
): Explanation {
  return {
    observation: {
      key: `engines.prediction.observation.${prediction.fatigueRisk}`,
      params: { energyScore: prediction.energyScore },
    },
    analysis:
      avgSleepHours !== undefined
        ? { key: 'engines.prediction.analysisWithAvg', params: { avgSleepHours: avgSleepHours.toFixed(1) } }
        : { key: 'engines.prediction.analysis' },
    action: { key: RISK_ACTION_KEY[prediction.fatigueRisk] },
  };
}
