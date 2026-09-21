import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type RecipeRow = Database['public']['Tables']['recipes']['Row'];
export type RecipeInsertRow = Database['public']['Tables']['recipes']['Insert'];
export type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];
export type RecipeIngredientInsertRow = Database['public']['Tables']['recipe_ingredients']['Insert'];

export interface RecipeWithIngredients {
  recipe: RecipeRow;
  ingredients: RecipeIngredientRow[];
}

/** The caller's own recipes, most recent first. */
export async function listRecipes(client: SupotsuClient, userId: string): Promise<RecipeRow[]> {
  const { data, error } = await client.from('recipes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Public recipes from other users (Communauté). */
export async function listCommunityRecipes(client: SupotsuClient, userId: string): Promise<RecipeRow[]> {
  const { data, error } = await client
    .from('recipes')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function listIngredients(client: SupotsuClient, recipeId: string): Promise<RecipeIngredientRow[]> {
  const { data, error } = await client.from('recipe_ingredients').select('*').eq('recipe_id', recipeId).order('order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One recipe with its ingredients, or null if it doesn't exist (RLS hides what the caller can't see). */
export async function getRecipe(client: SupotsuClient, recipeId: string): Promise<RecipeWithIngredients | null> {
  const { data: recipe, error } = await client.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw error;
  if (!recipe) return null;
  const ingredients = await listIngredients(client, recipeId);
  return { recipe, ingredients };
}

async function insertIngredients(
  client: SupotsuClient,
  recipeId: string,
  ingredients: Omit<RecipeIngredientInsertRow, 'recipe_id'>[],
): Promise<RecipeIngredientRow[]> {
  if (ingredients.length === 0) return [];
  const rows = ingredients.map((ing) => ({ ...ing, recipe_id: recipeId }));
  const { data, error } = await client.from('recipe_ingredients').insert(rows).select('*');
  if (error) throw error;
  return data ?? [];
}

/**
 * Insère la recette puis ses ingrédients — sans transaction entre les deux,
 * même choix assumé qu'`insertUserSession` : une recette créée qui échoue à
 * mi-chemin reste vide et se supprime, pas de machinerie de retour en
 * arrière pour une simple création.
 */
export async function insertRecipe(
  client: SupotsuClient,
  row: RecipeInsertRow,
  ingredients: Omit<RecipeIngredientInsertRow, 'recipe_id'>[],
): Promise<RecipeWithIngredients> {
  const { data: recipe, error } = await client.from('recipes').insert(row).select('*').single();
  if (error) throw error;
  const inserted = await insertIngredients(client, recipe.id, ingredients);
  return { recipe, ingredients: inserted };
}

export async function deleteRecipe(client: SupotsuClient, recipeId: string): Promise<void> {
  const { error } = await client.from('recipes').delete().eq('id', recipeId);
  if (error) throw error;
}
