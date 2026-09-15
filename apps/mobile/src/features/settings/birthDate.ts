/**
 * Une date de naissance est un JOUR, pas un instant. Elle est stockée à midi
 * UTC : minuit local, lui, tombe la veille en UTC dès qu'on est à l'est de
 * Greenwich (le 15 juin à 0 h à Paris = le 14 à 22 h UTC), et l'âge — donc la
 * FC max estimée — serait décalé d'un jour.
 */
const utcNoon = (y: number, m: number, d: number): string => new Date(Date.UTC(y, m - 1, d, 12)).toISOString();

const MIN_AGE = 10;
const MAX_AGE = 100;

/**
 * « 15/06/1990 », « 5/6/1990 », « 15-06-1990 », « 15.06.1990 » ou
 * « 1990-06-15 » → ISO à midi UTC. `null` pour une date inexistante ou un âge
 * invraisemblable (hors 10-100 ans) : la FC max qui en découlerait serait fausse.
 */
export function parseBirthDate(text: string, today: Date = new Date()): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (fr) [d, m, y] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;

  const date = new Date(Date.UTC(y, m - 1, d, 12));
  // Le 31/02 deviendrait le 3 mars : on refuse plutôt que de deviner.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const age = (today.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < MIN_AGE || age > MAX_AGE) return null;
  return utcNoon(y, m, d);
}

/** ISO stocké → « JJ/MM/AAAA ». Composantes UTC : la date est stockée à midi UTC. */
export function formatBirthDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Une date lue sur l'appareil (Apple Santé la rend à minuit local) → son jour civil, à midi UTC. */
export function normalizeBirthDate(local: Date): string {
  return utcNoon(local.getFullYear(), local.getMonth() + 1, local.getDate());
}
