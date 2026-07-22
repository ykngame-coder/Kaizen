import type {
  Activity,
  Confidence,
  HealthMetric,
  ISODateString,
  NutritionEntry,
  NutritionTargets,
  Pillar,
} from '@supotsu/core';
import type { Explanation } from './result';
import {
  computeRecoveryScore,
  computeTrainingReadiness,
  recoveryBand,
  recoveryExplanation,
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
  title: string;
  /** 0-100, or null when there isn't enough data yet. */
  value: number | null;
  caption: string;
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

const readinessLabel = (v: number): string =>
  v >= 70 ? 'prêt à performer' : v >= 50 ? 'effort modéré' : 'prudence conseillée';

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
      title: 'Récupération',
      value: hasRecovery ? recovery.value : null,
      caption: hasRecovery ? recoveryBand(recovery.value) : 'Connecte tes données santé',
      explanation: recExp,
      confidence: recovery.confidence,
    },
    {
      key: 'readiness',
      title: 'Aptitude à l’effort',
      value: hasRecovery ? readiness.value : null,
      caption: hasRecovery ? readinessLabel(readiness.value) : 'Selon récup + charge',
      confidence: readiness.confidence,
    },
    {
      key: 'nutrition',
      title: 'Nutrition',
      value: hasNutrition ? nutrition.value : null,
      caption: hasNutrition ? 'apports du jour' : 'Ajoute un repas',
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
      observation: `Récupération bonne (${recovery.value}/100) et charge maîtrisée.`,
      analysis: 'Ton corps est prêt à encaisser une séance exigeante.',
      action: 'Profites-en pour une séance intense ou un travail de qualité.',
    };
    headlinePillar = 'performance';
    confidence = 'high';
  } else if (recExp) {
    headline = recExp;
    headlinePillar = 'recovery';
    confidence = recovery.confidence;
  } else {
    headline = {
      observation: 'Données du jour encore limitées.',
      analysis: 'Sans santé ni activité récente, le bilan reste partiel.',
      action: 'Importe ton export Garmin ou ajoute une activité pour un bilan complet.',
    };
    headlinePillar = 'decision';
    confidence = 'to_confirm';
  }

  return { headline, headlinePillar, confidence, sections };
}
