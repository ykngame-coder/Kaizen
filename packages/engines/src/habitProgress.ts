import type { Habit, HabitLog } from '@supotsu/core';

/**
 * Où en est une habitude — sur SA période, pas sur la journée.
 *
 * Une hebdomadaire se tient sur la semaine : « 3 séances » n'est pas « une
 * séance par jour, sept fois ». L'écran la redemandait chaque jour, cassait les
 * séries dès le lendemain et plafonnait le taux de réussite, faute de faire
 * cette distinction.
 *
 * La semaine commence le lundi, en heure locale, comme dans les rappels.
 */

export type HabitPeriod = 'day' | 'week';

export interface HabitPeriodProgress {
  /** Validations sur la période. */
  count: number;
  target: number;
  done: boolean;
  period: HabitPeriod;
}

/** habitId → jour (AAAA-MM-JJ) → nombre de validations. */
export type HabitLogIndex = Map<string, Map<string, number>>;

export const dayKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Le lundi de la semaine d'un jour donné, la fin (lundi suivant) et le nombre
 * de jours restants, ce jour compris.
 */
export function weekBoundsOf(day: Date): { start: Date; end: Date; daysLeft: number } {
  const dow = (day.getDay() + 6) % 7; // lundi = 0
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end, daysLeft: 7 - dow };
}

export function indexHabitLogs(logs: HabitLog[]): HabitLogIndex {
  const index: HabitLogIndex = new Map();
  for (const l of logs) {
    const perDay = index.get(l.habitId) ?? new Map<string, number>();
    const key = dayKeyOf(new Date(l.completedAt));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
    index.set(l.habitId, perDay);
  }
  return index;
}

/** Une cible à zéro ou négative rendrait l'habitude impossible à valider. */
const targetOf = (habit: Pick<Habit, 'targetPerPeriod'>): number => Math.max(1, habit.targetPerPeriod);

function countOn(index: HabitLogIndex, habitId: string, day: Date, period: HabitPeriod): number {
  const perDay = index.get(habitId);
  if (!perDay) return 0;
  if (period === 'day') return perDay.get(dayKeyOf(day)) ?? 0;
  const { start } = weekBoundsOf(day);
  let total = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    total += perDay.get(dayKeyOf(d)) ?? 0;
  }
  return total;
}

/** L'avancement d'une habitude à la date regardée, sur sa propre période. */
export function habitProgressOn(
  habit: Pick<Habit, 'id' | 'cadence' | 'targetPerPeriod'>,
  index: HabitLogIndex,
  day: Date,
): HabitPeriodProgress {
  const period: HabitPeriod = habit.cadence === 'weekly' ? 'week' : 'day';
  const target = targetOf(habit);
  const count = countOn(index, habit.id, day, period);
  return { count, target, done: count >= target, period };
}

/**
 * L'habitude comptait-elle comme tenue ce jour-là ? C'est ce qui décide des
 * séries, du calendrier 30 jours et du taux de réussite.
 *
 * Une hebdomadaire vaut pour TOUS les jours de sa semaine dès que la cible est
 * atteinte. Dans la semaine en cours, elle garde le bénéfice du doute tant
 * qu'il reste assez de jours pour la tenir : sans ça, chaque lundi matin
 * casserait la série à cause d'une habitude qu'il reste six jours pour faire.
 */
/**
 * L'habitude existait-elle déjà ce jour-là ? Un jour antérieur à sa création ne
 * doit ni la compter comme manquée, ni peser dans le dénominateur du taux de
 * réussite — sinon créer une habitude repeint le mois écoulé en rouge.
 */
export function habitExistedOn(habit: Pick<Habit, 'createdAt'>, day: Date): boolean {
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return new Date(habit.createdAt).getTime() < endOfDay;
}

export function habitSatisfiedOn(
  habit: Pick<Habit, 'id' | 'cadence' | 'targetPerPeriod' | 'createdAt'>,
  index: HabitLogIndex,
  day: Date,
  now: Date,
): boolean {
  // Rien à reprocher à une journée antérieure à la création de l'habitude.
  if (!habitExistedOn(habit, day)) return true;

  const progress = habitProgressOn(habit, index, day);
  if (progress.done) return true;
  if (progress.period === 'day') return false;

  const { start, end } = weekBoundsOf(day);
  if (now.getTime() < start.getTime()) return true; // semaine à venir
  if (now.getTime() >= end.getTime()) return false; // semaine révolue : le compte est arrêté

  // Semaine en cours : ce qui reste à faire tient-il encore dans les jours qui
  // restent ? Les jours restants se comptent depuis aujourd'hui, pas depuis le
  // jour regardé — c'est le temps réellement disponible.
  const remaining = progress.target - progress.count;
  return remaining < weekBoundsOf(now).daysLeft;
}
