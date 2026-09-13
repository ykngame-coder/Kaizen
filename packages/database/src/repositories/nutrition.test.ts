import { describe, expect, it } from 'vitest';
import { deleteNutritionEntries, insertNutritionEntries, listNutritionEntries, type NutritionEntryRow } from './nutrition';
import type { SupotsuClient } from '../client';

/**
 * Même piège que `listHabitLogs` : un select non borné, et PostgREST qui
 * plafonne toute réponse à 1000 lignes sans le dire. Au-delà, les aliments
 * les plus anciens disparaissaient — et « Copier depuis » va justement les
 * chercher.
 */
function fakeClient(total: number, cap = 1000) {
  let calls = 0;
  const orders: string[] = [];
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `n-${i}`,
    logged_at: new Date(Date.UTC(2026, 8, 6) - i * 3_600_000).toISOString(),
  })) as NutritionEntryRow[];

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: (col: string) => {
      orders.push(col);
      return builder;
    },
    range: (from: number, to: number) => {
      calls += 1;
      const size = Math.min(to - from + 1, cap);
      return Promise.resolve({ data: rows.slice(from, from + size), error: null });
    },
  };
  return { client: { from: () => builder } as unknown as SupotsuClient, calls: () => calls, orders };
}

describe('listNutritionEntries', () => {
  it('rend toutes les lignes au-delà du plafond de 1000', async () => {
    const { client, calls } = fakeClient(2_450);
    expect(await listNutritionEntries(client, 'u1')).toHaveLength(2_450);
    expect(calls()).toBe(3);
  });

  it('s arrête en une requête sous une page, et sur un compte vide', async () => {
    const small = fakeClient(12);
    expect(await listNutritionEntries(small.client, 'u1')).toHaveLength(12);
    expect(small.calls()).toBe(1);
    const empty = fakeClient(0);
    expect(await listNutritionEntries(empty.client, 'u1')).toEqual([]);
  });

  it('ne boucle pas sur un multiple exact de la page', async () => {
    const { client, calls } = fakeClient(2000);
    expect(await listNutritionEntries(client, 'u1')).toHaveLength(2000);
    expect(calls()).toBe(3);
  });

  it('trie avec une clé secondaire, sans quoi les pages se chevauchent', async () => {
    const { client, orders } = fakeClient(3);
    await listNutritionEntries(client, 'u1');
    expect(orders).toEqual(['logged_at', 'id']);
  });
});

describe('écritures groupées', () => {
  it('n envoie aucune requête pour une liste vide', async () => {
    const client = { from: () => { throw new Error('ne devrait pas être appelé'); } } as unknown as SupotsuClient;
    expect(await insertNutritionEntries(client, [])).toEqual([]);
    await expect(deleteNutritionEntries(client, [])).resolves.toBeUndefined();
  });

  it('insère toutes les lignes en une seule requête', async () => {
    let inserted: unknown[] = [];
    let calls = 0;
    const builder = {
      insert: (rows: unknown[]) => { calls += 1; inserted = rows; return builder; },
      select: () => Promise.resolve({ data: inserted, error: null }),
    };
    const client = { from: () => builder } as unknown as SupotsuClient;
    const out = await insertNutritionEntries(client, [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u1' }] as never);
    expect(out).toHaveLength(3);
    expect(calls).toBe(1);
  });
});
