import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type CustomFoodRow = Database['public']['Tables']['custom_foods']['Row'];
export type CustomFoodInsertRow = Database['public']['Tables']['custom_foods']['Insert'];

/** Look up a barcode Open Food Facts doesn't know, in what users already added. */
export async function getCustomFoodByBarcode(client: SupotsuClient, barcode: string): Promise<CustomFoodRow | null> {
  const { data, error } = await client.from('custom_foods').select('*').eq('barcode', barcode).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Ajoute un aliment pour un code-barres inconnu d'OFF, pour tout le monde.
 * Un seul ajout par code-barres : le conflit signale que quelqu'un d'autre
 * vient de l'ajouter, l'appelant peut relire au lieu d'écraser sa fiche.
 */
export async function insertCustomFood(client: SupotsuClient, row: CustomFoodInsertRow): Promise<CustomFoodRow> {
  const { data, error } = await client.from('custom_foods').insert(row).select('*').single();
  if (error) throw error;
  return data;
}
