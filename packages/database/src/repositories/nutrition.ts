import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type NutritionEntryRow = Database['public']['Tables']['nutrition_entries']['Row'];
export type NutritionEntryInsertRow = Database['public']['Tables']['nutrition_entries']['Insert'];

/** Insert one logged intake. */
export async function insertNutritionEntry(
  client: SupotsuClient,
  row: NutritionEntryInsertRow,
): Promise<NutritionEntryRow> {
  const { data, error } = await client
    .from('nutrition_entries')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** List the user's intake entries, most recent first. */
export async function listNutritionEntries(
  client: SupotsuClient,
  userId: string,
): Promise<NutritionEntryRow[]> {
  const { data, error } = await client
    .from('nutrition_entries')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
