import { describe, expect, it } from 'vitest';
import { copyRecipe, deleteRecipe, getRecipe, insertRecipe, listCommunityRecipes, listRecipes, updateRecipe, type RecipeIngredientRow, type RecipeRow } from './recipes';
import type { SupotsuClient } from '../client';

interface Tables {
  recipes: RecipeRow[];
  recipe_ingredients: RecipeIngredientRow[];
}

const seed = (): Tables => ({ recipes: [], recipe_ingredients: [] });

/** Fake client en mémoire : deux tables, filtres/tri/insert/update/delete au minimum utile ici. */
function makeClient(tables: Tables, failInsertOnceOn?: keyof Tables): SupotsuClient {
  let nextId = 0;
  let failed = false;

  function builder(table: keyof Tables) {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    let sortCol: string | null = null;
    let sortAsc = true;

    const materialize = (): Record<string, unknown>[] => {
      if (mode === 'insert') {
        if (!failed && table === failInsertOnceOn) {
          failed = true;
          throw new Error('boom');
        }
        const values = Array.isArray(payload) ? payload : [payload as Record<string, unknown>];
        const created = values.map((v) => ({ id: `${table}-${nextId++}`, created_at: 'x', updated_at: 'x', ...v }));
        (tables[table] as unknown as Record<string, unknown>[]).push(...created);
        return created;
      }
      const rows = tables[table] as unknown as Record<string, unknown>[];
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') matched.forEach((r) => Object.assign(r, payload));
      if (mode === 'delete') {
        (tables as unknown as Record<string, unknown[]>)[table as string] = rows.filter((r) => !matched.includes(r));
      }
      if (sortCol) {
        const col = sortCol;
        matched = [...matched].sort((a, b) => ((a[col] as string) > (b[col] as string) ? 1 : -1) * (sortAsc ? 1 : -1));
      }
      return matched;
    };

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        sortCol = col;
        sortAsc = opts?.ascending !== false;
        return api;
      },
      insert: (value: Record<string, unknown> | Record<string, unknown>[]) => {
        mode = 'insert';
        payload = value;
        return api;
      },
      update: (patch: Record<string, unknown>) => {
        mode = 'update';
        payload = patch;
        return api;
      },
      delete: () => {
        mode = 'delete';
        return api;
      },
      maybeSingle: () => {
        try {
          return Promise.resolve({ data: materialize()[0] ?? null, error: null });
        } catch (e) {
          return Promise.resolve({ data: null, error: e });
        }
      },
      single: () => {
        try {
          return Promise.resolve({ data: materialize()[0] ?? null, error: null });
        } catch (e) {
          return Promise.resolve({ data: null, error: e });
        }
      },
      then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
        try {
          resolve({ data: materialize(), error: null });
        } catch (e) {
          resolve({ data: null, error: e });
        }
      },
    };
    return api;
  }

  return { from: (table: keyof Tables) => builder(table) } as unknown as SupotsuClient;
}

describe('listRecipes', () => {
  it('rend seulement les recettes de l utilisateur, triées par date desc', async () => {
    const tables = seed();
    tables.recipes.push(
      { id: 'r1', user_id: 'u1', name: 'A', visibility: 'private', created_at: '2026-01-01T00:00:00.000Z', updated_at: 'x' },
      { id: 'r2', user_id: 'u2', name: 'B', visibility: 'private', created_at: '2026-01-02T00:00:00.000Z', updated_at: 'x' },
      { id: 'r3', user_id: 'u1', name: 'C', visibility: 'public', created_at: '2026-01-03T00:00:00.000Z', updated_at: 'x' },
    );
    const out = await listRecipes(makeClient(tables), 'u1');
    expect(out.map((r) => r.id)).toEqual(['r3', 'r1']);
  });
});

describe('listCommunityRecipes', () => {
  it('rend les recettes publiques des AUTRES utilisateurs seulement', async () => {
    const tables = seed();
    tables.recipes.push(
      { id: 'r1', user_id: 'u1', name: 'Mine privée', visibility: 'private', created_at: '2026-01-01T00:00:00.000Z', updated_at: 'x' },
      { id: 'r2', user_id: 'u1', name: 'Mine publique', visibility: 'public', created_at: '2026-01-02T00:00:00.000Z', updated_at: 'x' },
      { id: 'r3', user_id: 'u2', name: 'Sa publique', visibility: 'public', created_at: '2026-01-03T00:00:00.000Z', updated_at: 'x' },
    );
    const out = await listCommunityRecipes(makeClient(tables), 'u1');
    expect(out.map((r) => r.id)).toEqual(['r3']);
  });
});

describe('getRecipe', () => {
  it('rend null si la recette n existe pas', async () => {
    expect(await getRecipe(makeClient(seed()), 'missing')).toBeNull();
  });

  it('rend la recette avec ses ingrédients triés par ordre', async () => {
    const tables = seed();
    tables.recipes.push({ id: 'r1', user_id: 'u1', name: 'Soupe', visibility: 'private', created_at: 'x', updated_at: 'x' });
    tables.recipe_ingredients.push(
      { id: 'i2', recipe_id: 'r1', barcode: null, description: 'Carotte', kcal_per100g: 40, protein_g_per100g: 1, carb_g_per100g: 9, fat_g_per100g: 0, quantity_g: 200, order: 1 },
      { id: 'i1', recipe_id: 'r1', barcode: null, description: 'Bouillon', kcal_per100g: 5, protein_g_per100g: 0, carb_g_per100g: 1, fat_g_per100g: 0, quantity_g: 500, order: 0 },
    );
    const out = await getRecipe(makeClient(tables), 'r1');
    expect(out?.ingredients.map((i) => i.description)).toEqual(['Bouillon', 'Carotte']);
  });
});

describe('insertRecipe', () => {
  it('insère la recette puis ses ingrédients en bloc', async () => {
    const tables = seed();
    const out = await insertRecipe(
      makeClient(tables),
      { user_id: 'u1', name: 'Soupe', visibility: 'private' },
      [{ description: 'Carotte', kcal_per100g: 40, protein_g_per100g: 1, carb_g_per100g: 9, fat_g_per100g: 0, quantity_g: 200, order: 0 }],
    );
    expect(out.recipe.name).toBe('Soupe');
    expect(out.ingredients).toHaveLength(1);
    expect(tables.recipe_ingredients[0].recipe_id).toBe(out.recipe.id);
  });
});

describe('deleteRecipe', () => {
  it('supprime la recette', async () => {
    const tables = seed();
    tables.recipes.push({ id: 'r1', user_id: 'u1', name: 'X', visibility: 'private', created_at: 'x', updated_at: 'x' });
    await deleteRecipe(makeClient(tables), 'r1');
    expect(tables.recipes).toHaveLength(0);
  });
});

describe('updateRecipe', () => {
  it('remplace le nom, la visibilité et la liste d ingrédients', async () => {
    const tables = seed();
    tables.recipes.push({ id: 'r1', user_id: 'u1', name: 'Soupe', visibility: 'private', created_at: 'x', updated_at: 'x' });
    tables.recipe_ingredients.push({ id: 'i1', recipe_id: 'r1', barcode: null, description: 'Carotte', kcal_per100g: 40, protein_g_per100g: 1, carb_g_per100g: 9, fat_g_per100g: 0, quantity_g: 200, order: 0 });
    const out = await updateRecipe(makeClient(tables), 'r1', { name: 'Soupe v2', visibility: 'public' }, [
      { description: 'Poireau', kcal_per100g: 30, protein_g_per100g: 1, carb_g_per100g: 6, fat_g_per100g: 0, quantity_g: 150, order: 0 },
    ]);
    expect(out.recipe.name).toBe('Soupe v2');
    expect(out.recipe.visibility).toBe('public');
    expect(out.ingredients.map((i) => i.description)).toEqual(['Poireau']);
    expect(tables.recipe_ingredients.map((i) => i.description)).toEqual(['Poireau']);
  });

  it('restaure les anciens ingrédients si la réinsertion échoue', async () => {
    const tables = seed();
    tables.recipes.push({ id: 'r1', user_id: 'u1', name: 'Soupe', visibility: 'private', created_at: 'x', updated_at: 'x' });
    tables.recipe_ingredients.push({ id: 'i1', recipe_id: 'r1', barcode: null, description: 'Carotte', kcal_per100g: 40, protein_g_per100g: 1, carb_g_per100g: 9, fat_g_per100g: 0, quantity_g: 200, order: 0 });
    const client = makeClient(tables, 'recipe_ingredients');
    await expect(
      updateRecipe(client, 'r1', { name: 'Soupe v2', visibility: 'public' }, [
        { description: 'Poireau', kcal_per100g: 30, protein_g_per100g: 1, carb_g_per100g: 6, fat_g_per100g: 0, quantity_g: 150, order: 0 },
      ]),
    ).rejects.toThrow();
    expect(tables.recipe_ingredients.map((i) => i.description)).toEqual(['Carotte']);
  });
});

describe('copyRecipe', () => {
  it('duplique la recette d un autre utilisateur, en privé, avec ses ingrédients', async () => {
    const tables = seed();
    tables.recipes.push({ id: 'r1', user_id: 'u2', name: 'Soupe de u2', visibility: 'public', created_at: 'x', updated_at: 'x' });
    tables.recipe_ingredients.push({ id: 'i1', recipe_id: 'r1', barcode: null, description: 'Carotte', kcal_per100g: 40, protein_g_per100g: 1, carb_g_per100g: 9, fat_g_per100g: 0, quantity_g: 200, order: 0 });
    const out = await copyRecipe(makeClient(tables), 'u1', 'r1');
    expect(out.recipe.user_id).toBe('u1');
    expect(out.recipe.visibility).toBe('private');
    expect(out.recipe.id).not.toBe('r1');
    expect(out.ingredients.map((i) => i.description)).toEqual(['Carotte']);
    expect(tables.recipes).toHaveLength(2);
  });

  it('rejette si la recette source n existe pas', async () => {
    await expect(copyRecipe(makeClient(seed()), 'u1', 'missing')).rejects.toThrow();
  });
});
