export type LeaderboardCategory = 'general' | 'sport' | 'nutrition' | 'sleep';
export type LeaderboardPeriod = 'week' | 'quarter' | 'year';
export type DailyScoreColumn = 'kaizen' | 'sport' | 'nutrition' | 'sleep';

const PERIOD_DAYS: Record<LeaderboardPeriod, number> = { week: 7, quarter: 90, year: 365 };

/** Rolling-average window, in days, for a leaderboard period selector. */
export function periodToDays(period: LeaderboardPeriod): number {
  return PERIOD_DAYS[period];
}

const CATEGORY_COLUMN: Record<LeaderboardCategory, DailyScoreColumn> = {
  general: 'kaizen',
  sport: 'sport',
  nutrition: 'nutrition',
  sleep: 'sleep',
};

/** Which daily_scores column backs a given leaderboard category. */
export function categoryToColumn(category: LeaderboardCategory): DailyScoreColumn {
  return CATEGORY_COLUMN[category];
}

/** "Athlète 4821" fallback shown when a user opts into the leaderboard without setting a pseudo. */
export function defaultDisplayName(userId: string): string {
  const suffix = userId.replace(/-/g, '').slice(-4).toUpperCase();
  return `Athlète ${suffix}`;
}
