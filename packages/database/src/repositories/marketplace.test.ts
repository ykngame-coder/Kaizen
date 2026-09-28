import { describe, expect, it } from 'vitest';
import { enrollInProgram, unenrollFromProgram } from './marketplace';
import type { SupotsuClient } from '../client';

function fakeClient() {
  const upserts: unknown[] = [];
  const updates: { patch: unknown; filters: [string, string][] }[] = [];
  const builder = {
    upsert: (row: unknown, opts: unknown) => {
      upserts.push({ row, opts });
      return Promise.resolve({ error: null });
    },
    update: (patch: unknown) => {
      const entry = { patch, filters: [] as [string, string][] };
      updates.push(entry);
      const chain = {
        eq: (col: string, value: string) => {
          entry.filters.push([col, value]);
          return chain;
        },
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return chain;
    },
  };
  return { client: { from: () => builder } as unknown as SupotsuClient, upserts, updates };
}

describe('enrollInProgram', () => {
  it('upsert sans ignoreDuplicates — un conflit doit METTRE À JOUR, pas être ignoré', async () => {
    // Sinon, revenir après un abandon (même ligne, contrainte unique) ne
    // repasse jamais le statut à 'active' : silencieusement sans effet.
    const { client, upserts } = fakeClient();
    await enrollInProgram(client, 'u1', 'prog-1');
    expect(upserts).toHaveLength(1);
    const opts = (upserts[0] as { opts: { onConflict: string; ignoreDuplicates?: boolean } }).opts;
    expect(opts.onConflict).toBe('user_id,program_id');
    expect(opts.ignoreDuplicates).not.toBe(true);
  });

  it('écrit toujours le statut active', async () => {
    const { client, upserts } = fakeClient();
    await enrollInProgram(client, 'u1', 'prog-1');
    expect((upserts[0] as { row: { status: string } }).row.status).toBe('active');
  });
});

describe('unenrollFromProgram', () => {
  it('passe le statut à abandoned pour ce couple utilisateur/programme, sans supprimer la ligne', async () => {
    const { client, updates } = fakeClient();
    await unenrollFromProgram(client, 'u1', 'prog-1');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toEqual({ status: 'abandoned' });
    expect(updates[0]!.filters).toEqual([
      ['user_id', 'u1'],
      ['program_id', 'prog-1'],
    ]);
  });
});
