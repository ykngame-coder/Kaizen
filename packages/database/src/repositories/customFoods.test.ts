import { describe, expect, it } from 'vitest';
import { getCustomFoodByBarcode, insertCustomFood, type CustomFoodRow } from './customFoods';
import type { SupotsuClient } from '../client';

function fakeClient(rows: CustomFoodRow[] = []) {
  const inserted: unknown[] = [];
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      const row = rows.find((r) => r.barcode === value) ?? null;
      return { maybeSingle: () => Promise.resolve({ data: row, error: null }) };
    },
    insert: (row: unknown) => {
      inserted.push(row);
      return builder;
    },
    single: () => Promise.resolve({ data: { ...(inserted.at(-1) as object) } as CustomFoodRow, error: null }),
  };
  return { client: { from: () => builder } as unknown as SupotsuClient, inserted };
}

describe('getCustomFoodByBarcode', () => {
  it('rend la fiche déjà ajoutée par un autre utilisateur pour ce code-barres', async () => {
    const row = { barcode: '123', description: 'Pâté maison', kcal: 300, protein_g: 10, carb_g: 2, fat_g: 25, created_by: 'u1', created_at: 'x' };
    const { client } = fakeClient([row]);
    expect(await getCustomFoodByBarcode(client, '123')).toEqual(row);
  });

  it('rend null quand le code-barres n a jamais été ajouté', async () => {
    const { client } = fakeClient([]);
    expect(await getCustomFoodByBarcode(client, '999')).toBeNull();
  });
});

describe('insertCustomFood', () => {
  it('insère la fiche telle que fournie', async () => {
    const { client, inserted } = fakeClient([]);
    const row = { barcode: '456', description: 'Confiture artisanale', kcal: 250, created_by: 'u1' };
    await insertCustomFood(client, row);
    expect(inserted).toEqual([row]);
  });
});
