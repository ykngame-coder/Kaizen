/**
 * Une séance faite dans l'app et l'activité qu'une montre en a enregistrée
 * sont le même effort.
 *
 * Le dédoublonnage existant ne compare que des activités importées entre
 * elles : une séance jouée dans le lecteur vit dans une autre table, donc elle
 * apparaissait deux fois — deux cartes, et surtout deux fois dans la charge et
 * dans la récupération.
 *
 * L'appariement se fait au calcul, jamais en supprimant : les deux sources
 * restent intactes, et une décision manuelle l'emporte toujours.
 */

export interface MatchableWorkout {
  id: string;
  /** Fin de séance ; sans elle, rien à recouper. */
  completedAt?: string;
  durationSec?: number;
}

export interface MatchableActivity {
  id: string;
  type: string;
  startedAt: string;
  durationSec: number;
}

export type SessionLinkMode = 'linked' | 'separate';

/** Ce que l'utilisateur a corrigé à la main — rattachement forcé ou séparation. */
export interface SessionLink {
  workoutId: string;
  activityId: string;
  mode: SessionLinkMode;
}

export interface SessionPair {
  workoutId: string;
  activityId: string;
  /** Vrai quand c'est l'utilisateur qui l'a décidé. */
  manual: boolean;
}

export interface SessionMatch {
  pairs: SessionPair[];
  /** Activités qui restent à afficher pour elles-mêmes. */
  unmatchedActivityIds: string[];
}

/** En dessous, deux efforts ne font que se frôler : une séance qui finit quand l'autre commence. */
const MIN_OVERLAP_RATIO = 0.5;
/** Durée retenue pour une séance de l'app qui n'en déclare pas. */
const DEFAULT_WORKOUT_SEC = 45 * 60;

interface Span {
  start: number;
  end: number;
}

const workoutSpan = (w: MatchableWorkout): Span | undefined => {
  if (!w.completedAt) return undefined;
  const end = new Date(w.completedAt).getTime();
  if (Number.isNaN(end)) return undefined;
  return { start: end - (w.durationSec ?? DEFAULT_WORKOUT_SEC) * 1000, end };
};

const activitySpan = (a: MatchableActivity): Span => {
  const start = new Date(a.startedAt).getTime();
  return { start, end: start + a.durationSec * 1000 };
};

/** Part de recouvrement, rapportée au plus court des deux efforts. */
function overlapRatio(a: Span, b: Span): number {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (overlap <= 0) return 0;
  const shortest = Math.min(a.end - a.start, b.end - b.start);
  return shortest > 0 ? overlap / shortest : 0;
}

export function matchSessions(
  workouts: MatchableWorkout[],
  activities: MatchableActivity[],
  links: SessionLink[],
): SessionMatch {
  const decided = new Map(links.map((l) => [`${l.workoutId}|${l.activityId}`, l.mode]));
  const pairs: SessionPair[] = [];
  const takenWorkouts = new Set<string>();
  const takenActivities = new Set<string>();

  // Ce que l'utilisateur a rattaché lui-même passe avant tout calcul.
  for (const link of links) {
    if (link.mode !== 'linked') continue;
    pairs.push({ workoutId: link.workoutId, activityId: link.activityId, manual: true });
    takenWorkouts.add(link.workoutId);
    takenActivities.add(link.activityId);
  }

  for (const activity of activities) {
    if (takenActivities.has(activity.id)) continue;
    const span = activitySpan(activity);

    let best: { workoutId: string; ratio: number } | undefined;
    for (const workout of workouts) {
      if (takenWorkouts.has(workout.id)) continue;
      if (decided.get(`${workout.id}|${activity.id}`) === 'separate') continue;
      const other = workoutSpan(workout);
      if (!other) continue;
      const ratio = overlapRatio(span, other);
      // À égalité, le premier trouvé gagne : l'ordre des séances est stable.
      if (ratio >= MIN_OVERLAP_RATIO && (!best || ratio > best.ratio)) {
        best = { workoutId: workout.id, ratio };
      }
    }

    if (best) {
      pairs.push({ workoutId: best.workoutId, activityId: activity.id, manual: false });
      takenWorkouts.add(best.workoutId);
      takenActivities.add(activity.id);
    }
  }

  return {
    pairs,
    unmatchedActivityIds: activities.filter((a) => !takenActivities.has(a.id)).map((a) => a.id),
  };
}
