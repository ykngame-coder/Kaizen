/** Une ligne existante, réduite à ce qu'il faut pour décider de la garder. */
export interface KeyedRow {
  id: string;
  /** Horodatage qui identifie la ligne dans le lot : début de session, `measured_at`… */
  at: string;
}

/**
 * Les lignes à supprimer pour qu'un lot REMPLACE une fenêtre au lieu de s'y
 * ajouter : celles de [from, to) dont l'horodatage n'est plus dans le lot.
 *
 * Garde-fou : si le lot ne contient rien dans la fenêtre, on ne supprime rien.
 * Santé ne signale pas une permission retirée — il rend une liste vide, et un
 * remplacement naïf effacerait alors tout l'historique du type.
 *
 * Les instants sont comparés en millisecondes : Postgres rend
 * `2026-07-20T21:47:00+00:00` là où l'import écrit `…:00.000Z`.
 */
export function staleRowIds(existing: KeyedRow[], keepAts: string[], from: string, to: string): string[] {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const inWindow = (ms: number): boolean => ms >= f && ms < t;
  const keep = new Set(keepAts.map((a) => new Date(a).getTime()).filter(inWindow));
  if (keep.size === 0) return [];
  return existing
    .filter((r) => {
      const ms = new Date(r.at).getTime();
      return inWindow(ms) && !keep.has(ms);
    })
    .map((r) => r.id);
}

/** Taille des lots de suppression : une liste d'identifiants trop longue ne tient pas dans l'URL. */
export const DELETE_CHUNK = 200;
