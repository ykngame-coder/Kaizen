/**
 * Quand tomberont les séances d'un programme de coach.
 *
 * Le catalogue déroulait une liste plate à un rythme constant. Un vrai
 * programme ne s'écrit pas comme ça : ses semaines n'ont pas toutes le même
 * nombre de séances (2-3-2-3 pour la prépa Hyrox), et une séance appartient à
 * SA semaine — la décaler parce que la précédente en comptait une de moins
 * casse la progression voulue par le coach.
 */

export interface ProgramSessionLink {
  sessionId: string;
  /** 1 pour la première semaine. */
  weekNumber: number;
  /** Position dans la semaine. */
  order: number;
}

export interface ScheduledProgramSession extends ProgramSessionLink {
  /** Jour civil local, AAAA-MM-JJ. */
  plannedFor: string;
}

/**
 * Jours de la semaine retenus selon le nombre de séances (lundi = 0), choisis
 * pour laisser du repos entre deux : deux séances tombent lundi et jeudi, pas
 * lundi et mardi.
 */
const WEEKDAYS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 3, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Le lundi de la semaine de `from` — `from` lui-même s'il est déjà lundi,
 * jamais celui d'après. `startFrom` est maintenant une date choisie à la main
 * (écran d'inscription) : la respecter au plus près prime sur l'ancienne
 * protection « jamais le jour même », qui n'avait de sens que pour un départ
 * implicite sur « maintenant ».
 */
function mondayOfWeek(from: Date): Date {
  const dow = (from.getDay() + 6) % 7; // lundi = 0
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() - dow);
}

export function programSessionDates(
  links: ProgramSessionLink[],
  startFrom: Date = new Date(),
): ScheduledProgramSession[] {
  if (links.length === 0) return [];
  const sorted = [...links].sort((a, b) => a.weekNumber - b.weekNumber || a.order - b.order);
  const start = mondayOfWeek(startFrom);

  const perWeek = new Map<number, ProgramSessionLink[]>();
  for (const l of sorted) {
    const week = perWeek.get(l.weekNumber) ?? [];
    week.push(l);
    perWeek.set(l.weekNumber, week);
  }

  const out: ScheduledProgramSession[] = [];
  for (const [weekNumber, week] of perWeek) {
    const pattern = WEEKDAYS[Math.min(7, Math.max(1, week.length))] ?? WEEKDAYS[3]!;
    week.forEach((link, i) => {
      // La semaine N part du lundi + (N−1) semaines : une semaine sans séance
      // reste une semaine, elle ne se referme pas sur la suivante.
      const day = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + (weekNumber - 1) * 7 + (pattern[i] ?? pattern[pattern.length - 1]!),
      );
      out.push({ ...link, plannedFor: dayKey(day) });
    });
  }
  return out;
}
