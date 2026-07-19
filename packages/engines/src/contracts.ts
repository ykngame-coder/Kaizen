import type { Activity, HealthMetric, ScoreKind, SetEntry } from '@supotsu/core';
import type { EngineContext, EngineResult, Recommendation } from './result';

/**
 * Engine contracts. Interfaces only — no implementation, no UI, no persistence
 * (Master Prompt P2: engines communicate solely through interfaces; the
 * Decision Engine orchestrates but performs no specialized calculation).
 *
 * Each engine is independently replaceable behind its `key`.
 */

export type EngineKey =
  | 'sleep'
  | 'recovery'
  | 'performance'
  | 'nutrition'
  | 'habit'
  | 'training'
  | 'health'
  | 'prediction'
  | 'recommendation'
  | 'metric'
  | 'dataQuality'
  | 'knowledge'
  | 'decision';

/** Marker every engine implements so the registry can index it. */
export interface Engine {
  readonly key: EngineKey;
}

export interface SleepEngine extends Engine {
  readonly key: 'sleep';
  scoreSleep(ctx: EngineContext, metrics: HealthMetric[]): Promise<EngineResult<number>>;
}

export interface RecoveryEngine extends Engine {
  readonly key: 'recovery';
  /** Recovery Score 0-100 (Master Prompt P13.4). */
  scoreRecovery(ctx: EngineContext, metrics: HealthMetric[]): Promise<EngineResult<number>>;
  /** Training readiness, distinct from recovery (Master Prompt P13.11). */
  trainingReadiness(ctx: EngineContext, metrics: HealthMetric[]): Promise<EngineResult<number>>;
}

export interface PerformanceEngine extends Engine {
  readonly key: 'performance';
  scorePerformance(ctx: EngineContext, activities: Activity[]): Promise<EngineResult<number>>;
  /** Acute:chronic workload ratio (Master Prompt P10.6, P34.10). */
  acuteChronicRatio(ctx: EngineContext, activities: Activity[]): Promise<EngineResult<number>>;
}

export interface TrainingEngine extends Engine {
  readonly key: 'training';
  /** Progressive-overload suggestion for the next set (Master Prompt P36.10). */
  suggestProgression(ctx: EngineContext, history: SetEntry[]): Promise<EngineResult<SetEntry>>;
}

export interface MetricEngine extends Engine {
  readonly key: 'metric';
  computeScore(
    ctx: EngineContext,
    kind: ScoreKind,
    inputs: Record<string, number>,
  ): Promise<EngineResult<number>>;
}

export interface DataQualityEngine extends Engine {
  readonly key: 'dataQuality';
  /** Flags anomalies, e.g. "100 km in 10 min" (Master Prompt P23.13). */
  validateActivity(ctx: EngineContext, activity: Activity): Promise<EngineResult<boolean>>;
}

export interface RecommendationEngine extends Engine {
  readonly key: 'recommendation';
  dailyRecommendation(ctx: EngineContext): Promise<EngineResult<Recommendation>>;
}

/** Aggregated snapshot the Decision Engine assembles for the dashboard. */
export interface DailyDecision {
  overallScore: number;
  recoveryScore: number;
  readiness: number;
  recommendation: Recommendation;
  alerts: string[];
}

/**
 * Central orchestrator. Coordinates the specialized engines but runs no domain
 * math of its own (Master Prompt P2: "il orchestre uniquement les décisions").
 */
export interface DecisionEngine extends Engine {
  readonly key: 'decision';
  decideDaily(ctx: EngineContext): Promise<EngineResult<DailyDecision>>;
}
