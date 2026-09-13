import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

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

/**
 * Insère plusieurs aliments en UNE requête — tout ou rien. Copier un repas de
 * trois aliments ne doit jamais en laisser deux si le réseau lâche au milieu.
 */
export async function insertNutritionEntries(
  client: SupotsuClient,
  rows: NutritionEntryInsertRow[],
): Promise<NutritionEntryRow[]> {
  if (rows.length === 0) return [];
  const { data, error } = await client.from('nutrition_entries').insert(rows).select('*');
  if (error) throw error;
  return data ?? [];
}

/**
 * List the user's intake entries, most recent first.
 *
 * Paginée : PostgREST plafonne toute réponse à `max-rows` (1000 chez
 * Supabase) sans le signaler comme une erreur — c'est ce qui effaçait les
 * habitudes des jours passés. Au-delà de 1000 aliments, les plus anciens
 * disparaissaient de même, et c'est précisément eux que « Copier depuis » va
 * chercher. `id` en clé secondaire : `logged_at` n'est pas unique, et sans
 * ordre total une ligne peut passer d'une page à l'autre et être lue deux fois
 * ou jamais.
 */
export async function listNutritionEntries(
  client: SupotsuClient,
  userId: string,
): Promise<NutritionEntryRow[]> {
  return fetchAllPages((from, to) =>
    client
      .from('nutrition_entries')
      .select('*')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  );
}

/** Delete a single logged intake (e.g. a mislogged or duplicate meal). */
export async function deleteNutritionEntry(client: SupotsuClient, entryId: string): Promise<void> {
  const { error } = await client.from('nutrition_entries').delete().eq('id', entryId);
  if (error) throw error;
}

/** Supprime plusieurs aliments en une requête — tout ou rien. */
export async function deleteNutritionEntries(client: SupotsuClient, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  const { error } = await client.from('nutrition_entries').delete().in('id', entryIds);
  if (error) throw error;
}

/** Adjust a logged intake's calories/macros (e.g. a portion estimate corrected after the fact). */
export async function updateNutritionEntry(
  client: SupotsuClient,
  entryId: string,
  patch: Partial<Pick<NutritionEntryInsertRow, 'kcal' | 'protein_g' | 'carb_g' | 'fat_g' | 'meal_type' | 'logged_at'>>,
): Promise<NutritionEntryRow> {
  const { data, error } = await client.from('nutrition_entries').update(patch).eq('id', entryId).select('*').single();
  if (error) throw error;
  return data;
}
