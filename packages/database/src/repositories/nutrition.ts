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

/** Delete a single logged intake (e.g. a mislogged or duplicate meal). */
export async function deleteNutritionEntry(client: SupotsuClient, entryId: string): Promise<void> {
  const { error } = await client.from('nutrition_entries').delete().eq('id', entryId);
  if (error) throw error;
}

/** Adjust a logged intake's calories/macros (e.g. a portion estimate corrected after the fact). */
export async function updateNutritionEntry(
  client: SupotsuClient,
  entryId: string,
  patch: Pick<NutritionEntryInsertRow, 'kcal' | 'protein_g' | 'carb_g' | 'fat_g'>,
): Promise<NutritionEntryRow> {
  const { data, error } = await client.from('nutrition_entries').update(patch).eq('id', entryId).select('*').single();
  if (error) throw error;
  return data;
}
