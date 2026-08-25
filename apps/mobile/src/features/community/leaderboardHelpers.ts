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

/** YYYY-MM-DD in the device's local calendar day (not UTC) — the bucket daily_scores rows are keyed by. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whether an ISO date string (e.g. from useSelectedDay/DayNav) falls on the device's current local calendar day. */
export function isTodayLocal(iso: string): boolean {
  return localDateKey(new Date(iso)) === localDateKey(new Date());
}

/** "Athlète 4821" fallback shown when a user opts into the leaderboard without setting a pseudo. */
export function defaultDisplayName(userId: string): string {
  const suffix = userId.replace(/-/g, '').slice(-4).toUpperCase();
  return `Athlète ${suffix}`;
}
