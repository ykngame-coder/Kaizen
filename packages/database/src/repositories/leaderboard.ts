import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type DailyScoreColumn = 'kaizen' | 'sport' | 'nutrition' | 'sleep';
export type DailyScoreRow = Database['public']['Tables']['daily_scores']['Row'];

/** Upsert today's score for one category — idempotent, safe to call every time the value is (re)computed. */
export async function upsertDailyScore(
  client: SupotsuClient,
  userId: string,
  column: DailyScoreColumn,
  value: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    user_id: userId,
    date: today,
    [column]: value,
  } as Database['public']['Tables']['daily_scores']['Insert'];
  const { error } = await client
    .from('daily_scores')
    .upsert(payload, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export interface GeneralLeaderboardRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avg_score: number;
  rank: number;
}

/** Ranked, averaged standings for one category over the last `days` days — opted-in users only (RLS + the RPC's own filter). */
export async function fetchGeneralLeaderboard(
  client: SupotsuClient,
  category: 'general' | 'sport' | 'nutrition' | 'sleep',
  days: number,
): Promise<GeneralLeaderboardRow[]> {
  const { data, error } = await client.rpc('leaderboard', { p_category: category, p_days: days });
  if (error) throw error;
  return data ?? [];
}
