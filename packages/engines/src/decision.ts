import type {
  Activity,
  Confidence,
  HealthMetric,
  ISODateString,
  NutritionEntry,
  NutritionTargets,
  Pillar,
} from '@supotsu/core';
import type { Explanation, I18nText } from './result';
import {
  computeRecoveryScore,
  computeTrainingReadiness,
  recoveryBand,
  recoveryExplanation,
  type RecoveryBand,
} from './recovery';
import { computeWorkload } from './scoring';
import { computeNutritionScore, nutritionExplanation } from './nutrition';

/**
 * Decision Engine (Master Prompt P18) — the orchestrator. It composes the pillar
 * engines (recovery, readiness, nutrition) into one explainable "daily briefing":
 * a single priority message chosen health-first, plus each pillar's readout. It
 * owns no data and computes nothing itself beyond arbitration.
 */

export interface BriefingSection {
  key: 'recovery' | 'readiness' | 'nutrition';
  title: I18nText;
  /** 0-100, or null when there isn't enough data yet. */
  value: number | null;
  caption: I18nText;
  explanation?: Explanation;
  confidence: Confidence;
}

export interface DailyBriefing {
  /** The single most important thing today (Observation → Analyse → Action). */
  headline: Explanation;
  headlinePillar: Pillar;
  confidence: Confidence;
  sections: BriefingSection[];
}

const readinessLabelKey = (v: number): string =>
  v >= 70 ? 'engines.decision.readiness.high' : v >= 50 ? 'engines.decision.readiness.moderate' : 'engines.decision.readiness.low';

const RECOVERY_BAND_KEY: Record<RecoveryBand, string> = {
  excellent: 'engines.decision.recoveryBand.excellent',
  correct: 'engines.decision.recoveryBand.correct',
  moyen: 'engines.decision.recoveryBand.moyen',
  faible: 'engines.decision.recoveryBand.faible',
};

export interface BriefingInput {
  activities: Activity[];
  healthMetrics: HealthMetric[];
  nutritionEntries: NutritionEntry[];
  targets: NutritionTargets;
  asOf: ISODateString;
}

/** Compose the day's briefing from the pillar engines. */
export function buildDailyBriefing(input: BriefingInput): DailyBriefing {
  const { activities, healthMetrics, nutritionEntries, targets, asOf } = input;

  const recovery = computeRecoveryScore(healthMetrics, asOf);
  const hasRecovery = recovery.confidence !== 'to_confirm';
  const recExp = recoveryExplanation(healthMetrics, asOf);

  const workload = computeWorkload(activities, asOf);
  const readiness = computeTrainingReadiness(healthMetrics, workload.acuteWeekly, asOf);

  const nutrition = computeNutritionScore(nutritionEntries, targets, asOf);
  const hasNutrition = nutrition.confidence !== 'to_confirm';
  const nutExp = nutritionExplanation(nutritionEntries, targets, asOf);

  const sections: BriefingSection[] = [
    {
      key: 'recovery',
      title: { key: 'engines.decision.section.recovery.title' },
      value: hasRecovery ? recovery.value : null,
      caption: hasRecovery
        ? { key: RECOVERY_BAND_KEY[recoveryBand(recovery.value)] }
        : { key: 'engines.decision.section.recovery.noData' },
      explanation: recExp,
      confidence: recovery.confidence,
    },
    {
      key: 'readiness',
      title: { key: 'engines.decision.section.readiness.title' },
      value: hasRecovery ? readiness.value : null,
      caption: hasRecovery ? { key: readinessLabelKey(readiness.value) } : { key: 'engines.decision.section.readiness.noData' },
      confidence: readiness.confidence,
    },
    {
      key: 'nutrition',
      title: { key: 'engines.decision.section.nutrition.title' },
      value: hasNutrition ? nutrition.value : null,
      caption: hasNutrition ? { key: 'engines.decision.section.nutrition.today' } : { key: 'engines.decision.section.nutrition.noData' },
      explanation: nutExp,
      confidence: nutrition.confidence,
    },
  ];

  // Headline arbitration — health before performance (Master Prompt P1).
  let headline: Explanation;
  let headlinePillar: Pillar;
  let confidence: Confidence;

  if (hasRecovery && recoveryBand(recovery.value) === 'faible' && recExp) {
    headline = recExp;
    headlinePillar = 'recovery';
    confidence = recovery.confidence;
  } else if (hasNutrition && nutrition.value < 60 && nutExp) {
    headline = nutExp;
    headlinePillar = 'nutrition';
    confidence = nutrition.confidence;
  } else if (hasRecovery && readiness.value >= 70) {
    headline = {
      observation: { key: 'engines.decision.readyToTrain.observation', params: { recovery: recovery.value } },
      analysis: { key: 'engines.decision.readyToTrain.analysis' },
      action: { key: 'engines.decision.readyToTrain.action' },
    };
    headlinePillar = 'performance';
    confidence = 'high';
  } else if (recExp) {
    headline = recExp;
    headlinePillar = 'recovery';
    confidence = recovery.confidence;
  } else {
    headline = {
      observation: { key: 'engines.decision.limitedData.observation' },
      analysis: { key: 'engines.decision.limitedData.analysis' },
      action: { key: 'engines.decision.limitedData.action' },
    };
    headlinePillar = 'decision';
    confidence = 'to_confirm';
  }

  return { headline, headlinePillar, confidence, sections };
}
