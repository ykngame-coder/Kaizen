import type { Challenge, ChallengeMetric, ISODateString, LeaderboardStanding } from '@supotsu/core';
import type { EngineResult, Explanation } from './result';

/**
 * Community Engine (Master Prompt P37). Pure, deterministic scoring of challenge
 * progress and leaderboards — every rank can be traced back to counted facts.
 * It only ever works with aggregates, never exposing one user's data to another.
 */

interface ActivityLike {
  startedAt: ISODateString;
}

function inWindow(a: ActivityLike, challenge: Challenge): boolean {
  const t = new Date(a.startedAt).getTime();
  return t >= new Date(challenge.startsAt).getTime() && t <= new Date(challenge.endsAt).getTime();
}

/** Progress of one participant toward a challenge, from their own activities. */
export function computeChallengeProgress(
  challenge: Challenge,
  activities: ActivityLike[],
): number {
  const scoped = activities.filter((a) => inWindow(a, challenge));
  const metric: ChallengeMetric = challenge.metric;
  if (metric === 'active_days') {
    return new Set(scoped.map((a) => a.startedAt.slice(0, 10))).size;
  }
  return scoped.length; // activity_count
}

export interface ParticipantActivities {
  userId: string;
  activities: ActivityLike[];
}

/**
 * Rank participants by progress (desc). Ties share the standard competition rank
 * (1,2,2,4). Deterministic: same input → same order (userId breaks ties stably).
 */
export function computeLeaderboard(
  challenge: Challenge,
  participants: ParticipantActivities[],
): LeaderboardStanding[] {
  const scored = participants
    .map((p) => ({
      userId: p.userId,
      progress: computeChallengeProgress(challenge, p.activities),
    }))
    .sort((a, b) => b.progress - a.progress || a.userId.localeCompare(b.userId));

  let lastProgress: number | null = null;
  let lastRank = 0;
  return scored.map((s, index) => {
    const rank = lastProgress === s.progress ? lastRank : index + 1;
    lastProgress = s.progress;
    lastRank = rank;
    return {
      userId: s.userId,
      progress: s.progress,
      reachedTarget: s.progress >= challenge.target,
      rank,
    };
  });
}

/** Explainable status for the current user's own challenge progress. */
export function challengeExplanation(
  challenge: Challenge,
  progress: number,
  asOf: ISODateString,
): EngineResult<number> {
  const remaining = Math.max(0, challenge.target - progress);
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(challenge.endsAt).getTime() - new Date(asOf).getTime()) / 86_400_000),
  );
  let explanation: Explanation;
  if (progress >= challenge.target) {
    explanation = {
      observation: `Objectif atteint : ${progress}/${challenge.target}.`,
      analysis: 'Tu as rempli le défi sur la période.',
      action: 'Vise le haut du classement ou lance un nouveau défi.',
    };
  } else {
    explanation = {
      observation: `${progress}/${challenge.target}, il te reste ${remaining}.`,
      analysis: `Il reste ${daysLeft} jour(s) pour finir le défi.`,
      action:
        daysLeft > 0
          ? `Planifie environ ${Math.ceil(remaining / Math.max(1, daysLeft))} par jour pour y arriver.`
          : 'La période est terminée : rejoins un nouveau défi.',
    };
  }
  return {
    value: progress,
    confidence: 'high',
    explanation,
    sourcesUsed: ['supotsu'],
    generatedAt: asOf,
  };
}
