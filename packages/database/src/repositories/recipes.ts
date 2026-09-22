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

/**
 * Remplace le nom, la visibilité et la liste d'ingrédients d'une recette.
 *
 * Remplacement, pas fusion — même choix qu'`updateUserSession` : l'écran
 * d'édition renvoie la liste complète, la réconcilier ligne par ligne
 * n'apporterait rien. Les ingrédients sont traités EN PREMIER et la ligne
 * `recipes` en DERNIER : tant que la réinsertion n'a pas réussi, le nom et la
 * visibilité restent inchangés, pour qu'un échec ne rende jamais une recette
 * publique par accident (contradiction silencieuse avec le message d'erreur
 * affiché à l'utilisateur). Pas de transaction entre la suppression et la
 * réinsertion, donc les anciens ingrédients sont relus avant d'être effacés
 * et restaurés si l'insertion des nouveaux échoue en cours de route — une
 * édition ratée doit laisser la recette intacte, jamais vidée.
 */
export async function updateRecipe(
  client: SupotsuClient,
  recipeId: string,
  patch: { name: string; visibility: 'private' | 'public' },
  ingredients: Omit<RecipeIngredientInsertRow, 'recipe_id'>[],
): Promise<RecipeWithIngredients> {
  const previous = await listIngredients(client, recipeId);
  const { error: deleteError } = await client.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (deleteError) throw deleteError;
  let inserted: RecipeIngredientRow[];
  try {
    inserted = await insertIngredients(client, recipeId, ingredients);
  } catch (e) {
    if (previous.length > 0) {
      const { error: restoreError } = await client.from('recipe_ingredients').insert(previous.map(({ id, ...rest }) => rest));
      if (restoreError) throw restoreError;
    }
    throw e;
  }
  const { data: recipe, error } = await client
    .from('recipes')
    .update({ name: patch.name, visibility: patch.visibility })
    .eq('id', recipeId)
    .select('*')
    .single();
  if (error) throw error;
  return { recipe, ingredients: inserted };
}

/** Duplique une recette (typiquement celle d'un autre) dans les recettes du copieur, privée par défaut. */
export async function copyRecipe(client: SupotsuClient, userId: string, sourceRecipeId: string): Promise<RecipeWithIngredients> {
  const source = await getRecipe(client, sourceRecipeId);
  if (!source) throw new Error('Recette introuvable.');
  return insertRecipe(
    client,
    { user_id: userId, name: source.recipe.name, visibility: 'private' },
    source.ingredients.map(({ id, recipe_id, ...rest }) => rest),
  );
}
