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
      title: { key: 'engines.recommendation.acwrRisk.title' },
      confidence: acwr.confidence,
      articleId: 'acwr',
      explanation: {
        observation: { key: 'engines.recommendation.acwrRisk.observation', params: { ratio: acwr.ratio.toFixed(2) } },
        analysis: { key: 'engines.recommendation.acwrRisk.analysis' },
        action: { key: 'engines.recommendation.acwrRisk.action' },
      },
    });
  }

  // 2 — Low recovery.
  if (recovery.confidence !== 'to_confirm' && recovery.value < 40) {
    recs.push({
      priority: 1,
      pillar: 'recovery',
      title: { key: 'engines.recommendation.lowRecovery.title' },
      confidence: recovery.confidence,
      articleId: 'recovery',
      explanation: {
        observation: { key: 'engines.recommendation.lowRecovery.observation', params: { recovery: recovery.value } },
        analysis: { key: 'engines.recommendation.lowRecovery.analysis' },
        action: { key: 'engines.recommendation.lowRecovery.action' },
      },
    });
  }

  // 3 — Poor sleep.
  if (sleep.confidence !== 'to_confirm' && sleep.value < 45) {
    recs.push({
      priority: 2,
      pillar: 'sleep',
      title: { key: 'engines.recommendation.poorSleep.title' },
      confidence: sleep.confidence,
      articleId: 'sleep',
      explanation: {
        observation: { key: 'engines.recommendation.poorSleep.observation', params: { sleep: sleep.value } },
        analysis: { key: 'engines.recommendation.poorSleep.analysis' },
        action: { key: 'engines.recommendation.poorSleep.action' },
      },
    });
  }

  // 4 — Low subjective wellbeing.
  if (wellness.confidence !== 'to_confirm' && wellness.value < 40) {
    recs.push({
      priority: 3,
      pillar: 'recovery',
      title: { key: 'engines.recommendation.lowWellness.title' },
      confidence: wellness.confidence,
      articleId: 'wellness',
      explanation: {
        observation: { key: 'engines.recommendation.lowWellness.observation', params: { wellness: wellness.value } },
        analysis: { key: 'engines.recommendation.lowWellness.analysis' },
        action: { key: 'engines.recommendation.lowWellness.action' },
      },
    });
  }

  // 5 — Room to push (undertraining while fresh).
  if (acwr.ratio !== null && acwr.zone === 'sous-charge' && (recovery.value >= 60 || recovery.confidence === 'to_confirm')) {
    recs.push({
      priority: 4,
      pillar: 'performance',
      title: { key: 'engines.recommendation.roomToPush.title' },
      confidence: acwr.confidence,
      articleId: 'acwr',
      explanation: {
        observation: { key: 'engines.recommendation.roomToPush.observation', params: { ratio: acwr.ratio.toFixed(2) } },
        analysis: { key: 'engines.recommendation.roomToPush.analysis' },
        action: { key: 'engines.recommendation.roomToPush.action' },
      },
    });
  }

  // Positive default so the feed is never empty.
  if (recs.length === 0 && (activities.length > 0 || healthMetrics.length > 0)) {
    recs.push({
      priority: 9,
      pillar: 'decision',
      title: { key: 'engines.recommendation.allGood.title' },
      confidence: 'medium',
      articleId: 'supotsu-score',
      explanation: {
        observation: { key: 'engines.recommendation.allGood.observation' },
        analysis: { key: 'engines.recommendation.allGood.analysis' },
        action: { key: 'engines.recommendation.allGood.action' },
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
        title: { key: 'engines.recommendation.noData.title' },
        confidence: 'to_confirm',
        explanation: {
          observation: { key: 'engines.recommendation.noData.observation' },
          analysis: { key: 'engines.recommendation.noData.analysis' },
          action: { key: 'engines.recommendation.noData.action' },
        },
      };
  return { value, confidence, sourcesUsed: ['supotsu'], generatedAt: input.asOf };
}
