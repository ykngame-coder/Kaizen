import type { Activity, Confidence, HealthMetric, ISODateString, Pillar, SleepSession, WellnessCheckin } from '@supotsu/core';
import type { EngineResult, Recommendation } from './result';
import { computeRecoveryScore } from './recovery';
import { computeSleepScore2 } from './sleep';
import { computeWellnessIndex } from './wellness';
import { computeAcwr } from './load';

/**
 * Recommendation Engine (Master Prompt P18) — consolidates the pillar engines
 * into a prioritized, explainable set of daily recommendations. Health-first:
 * injury risk and recovery outrank performance. Each recommendation links to a
 * Knowledge article so the "why" is one tap away. Pure — data in, advice out.
 */

export interface PrioritizedRecommendation extends Recommendation {
  /** Priority 0 (highest) … larger = lower. */
  priority: number;
  /** Knowledge article that explains this recommendation. */
  articleId?: string;
}

export interface RecommendationInput {
  activities: Activity[];
  healthMetrics: HealthMetric[];
  wellnessCheckins: WellnessCheckin[];
  asOf: ISODateString;
  /** Optional — improves the sleep-quality component of Score 2.0 when available. */
  sleepSessions?: SleepSession[];
}

/**
 * Build the day's recommendations, most important first. Only rules with enough
 * data fire; the list is never empty as long as some data exists (a positive
 * "keep going" always closes it out).
 */
export function buildRecommendations(input: RecommendationInput): PrioritizedRecommendation[] {
  const { activities, healthMetrics, wellnessCheckins, asOf, sleepSessions } = input;
  const recs: PrioritizedRecommendation[] = [];

  const acwr = computeAcwr(activities, asOf);
  const recovery = computeRecoveryScore(healthMetrics, asOf);
  const sleep = computeSleepScore2(healthMetrics, asOf, 7, sleepSessions);
  const wellness = computeWellnessIndex(wellnessCheckins, asOf);

  // 1 — Injury risk from a training-load spike (safety first).
  if (acwr.ratio !== null && acwr.zone === 'risque') {
    recs.push({
      priority: 0,
      pillar: 'performance',
      title: 'Allège ta charge cette semaine',
      confidence: acwr.confidence,
      articleId: 'acwr',
      explanation: {
        observation: `Ton ratio charge aiguë/chronique est de ${acwr.ratio.toFixed(2)} (zone risque).`,
        analysis: 'Une hausse rapide de la charge augmente nettement le risque de blessure.',
        action: 'Réduis le volume de ~20 % et garde une séance facile pour absorber le pic.',
      },
    });
  }

  // 2 — Low recovery.
  if (recovery.confidence !== 'to_confirm' && recovery.value < 40) {
    recs.push({
      priority: 1,
      pillar: 'recovery',
      title: 'Priorité à la récupération',
      confidence: recovery.confidence,
      articleId: 'recovery',
      explanation: {
        observation: `Ta récupération est basse (${recovery.value}/100).`,
        analysis: 'Ton corps n’a pas encore encaissé la charge récente (sommeil, HRV, FC).',
        action: 'Vise du repos actif ou de la mobilité aujourd’hui, pas d’intensité.',
      },
    });
  }

  // 3 — Poor sleep.
  if (sleep.confidence !== 'to_confirm' && sleep.value < 45) {
    recs.push({
      priority: 2,
      pillar: 'sleep',
      title: 'Rattrape ton sommeil',
      confidence: sleep.confidence,
      articleId: 'sleep',
      explanation: {
        observation: `Ton score de sommeil est faible (${sleep.value}/100).`,
        analysis: 'Le manque de sommeil dégrade la récupération, l’humeur et la performance.',
        action: 'Couche-toi 30–60 min plus tôt ce soir et réduis les écrans avant le coucher.',
      },
    });
  }

  // 4 — Low subjective wellbeing.
  if (wellness.confidence !== 'to_confirm' && wellness.value < 40) {
    recs.push({
      priority: 3,
      pillar: 'recovery',
      title: 'Prends soin de ton mental',
      confidence: wellness.confidence,
      articleId: 'wellness',
      explanation: {
        observation: `Ton indice de bien-être est bas (${wellness.value}/100).`,
        analysis: 'Le stress et la fatigue mentale pèsent autant que la fatigue physique.',
        action: 'Accorde-toi une vraie pause : quelques minutes de respiration ou une marche.',
      },
    });
  }

  // 5 — Room to push (undertraining while fresh).
  if (acwr.ratio !== null && acwr.zone === 'sous-charge' && (recovery.value >= 60 || recovery.confidence === 'to_confirm')) {
    recs.push({
      priority: 4,
      pillar: 'performance',
      title: 'Tu peux monter en charge',
      confidence: acwr.confidence,
      articleId: 'acwr',
      explanation: {
        observation: `Ta charge récente est basse (ratio ${acwr.ratio.toFixed(2)}).`,
        analysis: 'Tu es sous ton niveau habituel et bien récupéré — il y a de la marge.',
        action: 'Ajoute un peu de volume ou d’intensité, progressivement.',
      },
    });
  }

  // Positive default so the feed is never empty.
  if (recs.length === 0 && (activities.length > 0 || healthMetrics.length > 0)) {
    recs.push({
      priority: 9,
      pillar: 'decision',
      title: 'Tout est au vert — continue',
      confidence: 'medium',
      articleId: 'supotsu-score',
      explanation: {
        observation: 'Tes indicateurs sont dans de bonnes plages aujourd’hui.',
        analysis: 'Rien n’appelle d’ajustement particulier.',
        action: 'Suis ton plan et garde la régularité — c’est elle qui paie.',
      },
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

/** The single top recommendation (satisfies RecommendationEngine.dailyRecommendation). */
export function dailyRecommendation(input: RecommendationInput): EngineResult<Recommendation> {
  const top = buildRecommendations(input)[0];
  const confidence: Confidence = top?.confidence ?? 'to_confirm';
  const value: Recommendation = top
    ? { pillar: top.pillar as Pillar, title: top.title, explanation: top.explanation, confidence }
    : {
        pillar: 'decision',
        title: 'Ajoute des données pour une reco',
        confidence: 'to_confirm',
        explanation: {
          observation: 'Pas encore assez de données.',
          analysis: 'Enregistre une activité ou connecte un appareil.',
          action: 'Reviens ici une fois quelques jours suivis.',
        },
      };
  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: input.asOf };
}
