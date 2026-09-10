export type SleepStage = 'deep' | 'rem' | 'light' | 'awake' | 'inBed';

export interface StageInterval {
  stage: SleepStage;
  startedAt: string;
  endedAt: string;
}

export interface MergedSleep {
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  inBedMin: number;
  /** deep + rem + light, sur la timeline fusionnée. */
  asleepMin: number;
  /** Segments non chevauchants, dans l'ordre — un seul stade par instant. */
  segments: StageInterval[];
}

/**
 * Un instant ne peut porter qu'un stade. Quand deux sources se contredisent, le
 * plus profond gagne : c'est le plus spécifique, et une source qui détecte du
 * sommeil profond a vu quelque chose que l'autre a manqué.
 *
 * `inBed` n'y figure pas : ce n'est pas un stade concurrent mais une ENVELOPPE
 * qui contient le sommeil et les réveils. Le faire concourir amputerait le
 * temps au lit de tout le temps dormi.
 */
const PRIORITY: Record<Exclude<SleepStage, 'inBed'>, number> = { deep: 5, rem: 4, light: 3, awake: 2 };

/** Durée couverte par des intervalles, chevauchements fusionnés. */
function unionMinutes(spans: { from: number; to: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let total = 0;
  let cursor = -Infinity;
  for (const s of sorted) {
    const from = Math.max(s.from, cursor);
    if (s.to > from) {
      total += s.to - from;
      cursor = s.to;
    }
  }
  return total / 60000;
}

/**
 * Fusionne des intervalles de sommeil, toutes sources confondues, en une
 * timeline sans chevauchement, puis mesure chaque stade.
 *
 * Les agrégats additionnaient les échantillons bruts. Une nuit présente dans
 * Apple Santé via la Watch ET via une autre app (AutoSleep, Garmin) était donc
 * comptée deux fois : ~7 h + ~7 h = ~14 h, profond/léger/REM doublés. C'est le
 * même double-comptage multi-sources que `cumulativeSum` règle pour les pas.
 *
 * Unir par stade ne suffirait pas : si la montre dit « profond » et l'autre
 * « léger » au même instant, les deux unions se chevaucheraient encore. D'où le
 * balayage : on découpe sur toutes les bornes, et chaque tranche élémentaire
 * reçoit un seul stade.
 */
export function mergeSleepTimeline(intervals: StageInterval[]): MergedSleep {
  const spans = intervals
    .map((i) => ({ stage: i.stage, from: new Date(i.startedAt).getTime(), to: new Date(i.endedAt).getTime() }))
    .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from);

  const empty: MergedSleep = { deepMin: 0, remMin: 0, lightMin: 0, awakeMin: 0, inBedMin: 0, asleepMin: 0, segments: [] };
  if (spans.length === 0) return empty;

  // « Au lit » se mesure à part, en union simple : il recouvre le sommeil.
  const inBedMin = unionMinutes(spans.filter((s) => s.stage === 'inBed'));
  const staged = spans.filter((s) => s.stage !== 'inBed') as { stage: Exclude<SleepStage, 'inBed'>; from: number; to: number }[];
  if (staged.length === 0) return { ...empty, inBedMin };

  const edges = [...new Set(staged.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
  const result: MergedSleep = { ...empty, inBedMin, segments: [] };

  for (let i = 0; i < edges.length - 1; i += 1) {
    const from = edges[i]!;
    const to = edges[i + 1]!;
    // Le stade le plus prioritaire parmi ceux qui couvrent cette tranche.
    let winner: Exclude<SleepStage, 'inBed'> | undefined;
    for (const s of staged) {
      if (s.from > from || s.to < to) continue;
      if (!winner || PRIORITY[s.stage] > PRIORITY[winner]) winner = s.stage;
    }
    if (!winner) continue;

    const minutes = (to - from) / 60000;
    if (winner === 'deep') result.deepMin += minutes;
    else if (winner === 'rem') result.remMin += minutes;
    else if (winner === 'light') result.lightMin += minutes;
    else result.awakeMin += minutes;

    // Prolonge le segment précédent s'il porte déjà le même stade, plutôt que
    // d'émettre une tranche par borne rencontrée.
    const last = result.segments.at(-1);
    if (last && last.stage === winner && last.endedAt === new Date(from).toISOString()) {
      last.endedAt = new Date(to).toISOString();
    } else {
      result.segments.push({ stage: winner, startedAt: new Date(from).toISOString(), endedAt: new Date(to).toISOString() });
    }
  }

  result.asleepMin = result.deepMin + result.remMin + result.lightMin;
  return result;
}
