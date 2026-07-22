import type { ISODateString, OwnedEntity } from './common';

/**
 * What a challenge measures. Kept deterministic and computable from data the
 * user already owns, so a leaderboard is never a black box (Master Prompt P1).
 */
export type ChallengeMetric = 'activity_count' | 'active_days';

/** A community challenge others can join (Master Prompt P37 communauté). */
export interface Challenge extends OwnedEntity {
  title: string;
  description?: string;
  metric: ChallengeMetric;
  target: number;
  startsAt: ISODateString;
  endsAt: ISODateString;
  visibility: 'public' | 'private';
}

/** Membership of a challenge (one row per user per challenge). */
export interface ChallengeParticipant extends OwnedEntity {
  challengeId: string;
  joinedAt: ISODateString;
}

/**
 * One participant's standing. Only aggregates (progress, rank) are ever exposed
 * across users — never their raw activities (privacy first, P8, P29).
 */
export interface LeaderboardStanding {
  userId: string;
  progress: number;
  reachedTarget: boolean;
  rank: number;
}
