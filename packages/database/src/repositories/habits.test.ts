import { describe, expect, it } from 'vitest';
import { listHabitLogs, type HabitLogRow } from './habits';
import type { SupotsuClient } from '../client';

/**
 * Régression : `listHabitLogs` faisait un select non borné, et PostgREST
 * plafonne toute réponse à `max-rows` (1000 chez Supabase) sans jamais le
 * signaler comme une erreur. Sur un compte chargé, les 1000 lignes rendues ne
 * couvraient que les deux derniers jours : tout jour antérieur se lisait
 * « rien de coché » et sa case ne pouvait plus jamais s'afficher validée.
 */
function fakeClient(total: number, cap = 1000): { client: SupotsuClient; calls: () => number } {
  let calls = 0;
  const rows: HabitLogRow[] = Array.from({ length: total }, (_, i) => ({
    id: `log-${i}`,
    user_id: 'u1',
    habit_id: 'h1',
    // Décroissant, comme le tri de la requête.
    completed_at: new Date(Date.UTC(2026, 8, 6) - i * 3_600_000).toISOString(),
    created_at: '2026-09-06T00:00:00.000Z',
  })) as HabitLogRow[];

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      calls += 1;
      // Le plafond serveur : jamais plus de `cap` lignes, quoi qu'on demande.
      const size = Math.min(to - from + 1, cap);
      return Promise.resolve({ data: rows.slice(from, from + size), error: null });
    },
  };
  return { client: { from: () => builder } as unknown as SupotsuClient, calls: () => calls };
}

describe('listHabitLogs', () => {
  it('rend TOUTES les lignes d un compte chargé, pas seulement les 1000 premières', async () => {
    const { client, calls } = fakeClient(20_623);
    const out = await listHabitLogs(client, 'u1');
    expect(out).toHaveLength(20_623);
    expect(calls()).toBe(21); // 20 pages pleines + une partielle qui termine la boucle
  });

  it('garde visibles les jours anciens, que le plafond effaçait', async () => {
    const { client } = fakeClient(20_623);
    const out = await listHabitLogs(client, 'u1');
    const jours = new Set(out.map((l) => l.completed_at.slice(0, 10)));
    // 20 623 lignes à une par heure couvrent bien plus que les 2 jours que
    // le select non borné laissait voir.
    expect(jours.size).toBeGreaterThan(2);
  });

  it('s arrête en une seule requête quand le compte tient sous une page', async () => {
    const { client, calls } = fakeClient(12);
    expect(await listHabitLogs(client, 'u1')).toHaveLength(12);
    expect(calls()).toBe(1);
  });

  it('termine proprement sur un compte vide', async () => {
    const { client, calls } = fakeClient(0);
    expect(await listHabitLogs(client, 'u1')).toEqual([]);
    expect(calls()).toBe(1);
  });

  it('ne boucle pas sans fin quand le total est un multiple exact de la page', async () => {
    const { client, calls } = fakeClient(2000);
    expect(await listHabitLogs(client, 'u1')).toHaveLength(2000);
    expect(calls()).toBe(3); // 2 pages pleines, puis une vide qui arrête
  });
});
