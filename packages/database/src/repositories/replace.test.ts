import { describe, expect, it } from 'vitest';
import { staleRowIds } from './replace';

const from = '2026-07-20T00:00:00.000Z';
const to = '2026-07-23T00:00:00.000Z';

describe('staleRowIds', () => {
  it('rend les lignes de la fenêtre absentes du lot', () => {
    const existing = [
      { id: 'keep', at: '2026-07-20T21:47:00+00:00' },
      { id: 'stale', at: '2026-07-21T21:30:00+00:00' },
    ];
    expect(staleRowIds(existing, ['2026-07-20T21:47:00.000Z'], from, to)).toEqual(['stale']);
  });

  it('compare les instants, pas leur écriture — Postgres rend +00:00 là où l import écrit .000Z', () => {
    const existing = [{ id: 'same', at: '2026-07-21T10:00:00+00:00' }];
    expect(staleRowIds(existing, ['2026-07-21T10:00:00.000Z'], from, to)).toEqual([]);
  });

  it('ne touche à rien hors de la fenêtre [from, to)', () => {
    const existing = [
      { id: 'before', at: '2026-07-19T23:59:59.999Z' },
      { id: 'at-end', at: to },
      { id: 'in', at: '2026-07-21T00:00:00.000Z' },
    ];
    expect(staleRowIds(existing, ['2026-07-22T00:00:00.000Z'], from, to)).toEqual(['in']);
  });

  it('ne supprime rien quand le lot ne contient rien dans la fenêtre — une permission retirée rend une liste vide', () => {
    const existing = [{ id: 'a', at: '2026-07-21T10:00:00.000Z' }];
    expect(staleRowIds(existing, [], from, to)).toEqual([]);
    expect(staleRowIds(existing, ['2026-08-01T10:00:00.000Z'], from, to)).toEqual([]);
  });
});
