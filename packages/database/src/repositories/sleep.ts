import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';
import { fetchAllPages } from '../paginate';

export type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row'];
export type SleepSessionInsertRow = Database['public']['Tables']['sleep_sessions']['Insert'];

/**
 * Collapse rows that share the table's unique key (user_id, started_at,
 * source) to their last occurrence. A single upsert statement can't apply
 * ON CONFLICT DO UPDATE twice to the same row — Postgres raises "cannot
 * affect row a second time" if two rows in the same batch collide on the
 * unique index (e.g. a HealthKit sync whose sample fetch produced two
 * overlapping sessions for what is really one night).
 */
export function dedupeSleepSessionRows(rows: SleepSessionInsertRow[]): SleepSessionInsertRow[] {
  const byKey = new Map<string, SleepSessionInsertRow>();
  for (const row of rows) byKey.set(`${row.user_id}|${row.started_at}|${row.source}`, row);
  return [...byKey.values()];
}

/** Insert many sleep sessions at once (import). Idempotent via the dedup index. */
export async function insertSleepSessions(
  client: SupotsuClient,
  rows: SleepSessionInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;
  // Re-syncing the same night from the same source (e.g. after a parser fix
  // like adding hypnogram segments) should refresh the row, not silently
  // no-op forever — full upsert (update on conflict) instead of ignoring it.
  const { error } = await client
    .from('sleep_sessions')
    .upsert(dedupeSleepSessionRows(rows), { onConflict: 'user_id,started_at,source' });
  if (error) throw error;
}

/** Insert one sleep session and return the row as the DB actually recorded it (real id, created_at) — for a caller that needs to hand the result back to the UI immediately, unlike the fire-and-forget bulk import path above. */
export async function insertSleepSession(
  client: SupotsuClient,
  row: SleepSessionInsertRow,
): Promise<SleepSessionRow> {
  const { data, error } = await client.from('sleep_sessions').insert(row).select().single();
  if (error) throw error;
  return data;
}

/** List the user's sleep sessions, most recent night first. */
export async function listSleepSessions(
  client: SupotsuClient,
  userId: string,
): Promise<SleepSessionRow[]> {
  return fetchAllPages((from, to) =>
    client
      .from('sleep_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(from, to),
  );
}

/**
 * Les sessions à supprimer pour qu'une synchro REMPLACE celles de sa source au
 * lieu de s'y ajouter : toutes les lignes de `source` commençant à partir de
 * la première session synchronisée, et qui ne font plus partie du lot.
 *
 * Nécessaire dès que le découpage des nuits change : une nuit redécoupée
 * reçoit une nouvelle heure de début, donc une nouvelle ligne, et l'ancienne
 * — mal découpée, souvent plus longue — resterait en base, où « la plus longue
 * session du jour » la choisirait encore.
 *
 * Les instants sont comparés en millisecondes : Postgres rend
 * `2026-07-20T21:47:00+00:00` là où l'import écrit `…:00.000Z`.
 */
export function staleSleepSessionIds(
  existing: Pick<SleepSessionRow, 'id' | 'started_at' | 'source'>[],
  synced: { startedAt: string }[],
  source: string,
): string[] {
  if (synced.length === 0) return [];
  const keep = new Set(synced.map((s) => new Date(s.startedAt).getTime()));
  const from = Math.min(...keep);
  return existing
    .filter((r) => r.source === source)
    .filter((r) => {
      const t = new Date(r.started_at).getTime();
      return t >= from && !keep.has(t);
    })
    .map((r) => r.id);
}

/** Les clés des sessions d'une source à partir d'un instant — de quoi calculer `staleSleepSessionIds`. */
export async function listSleepSessionKeys(
  client: SupotsuClient,
  userId: string,
  source: string,
  fromIso: string,
): Promise<Pick<SleepSessionRow, 'id' | 'started_at' | 'source'>[]> {
  return fetchAllPages((from, to) =>
    client
      .from('sleep_sessions')
      .select('id, started_at, source')
      .eq('user_id', userId)
      .eq('source', source)
      .gte('started_at', fromIso)
      .order('started_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
}

/** Supprime des sessions par identifiant, par lots : une liste d'identifiants trop longue ne tient pas dans l'URL. */
export async function deleteSleepSessions(client: SupotsuClient, ids: string[]): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await client.from('sleep_sessions').delete().in('id', ids.slice(i, i + CHUNK));
    if (error) throw error;
  }
}
