import type { Habit, HabitLog, ISODateString, NutritionEntry, SleepSession, Workout } from '@supotsu/core';
import { weekBoundsOf } from './habitProgress';

/**
 * Quels rappels locaux programmer, et quand.
 *
 * Pur : l'état entre, une liste de rappels datés sort. iOS ne réveille pas
 * l'app pour décider d'envoyer un rappel — tout est programmé à l'avance, donc
 * chaque condition est évaluée ICI, à la programmation. Ça tombe juste : valider
 * une habitude, boire ou terminer une séance passe par l'app, donc si elle n'a
 * pas été ouverte, la condition n'a pas changé.
 *
 * Voir docs/superpowers/specs/2026-09-16-rappels-locaux-design.md.
 */

export type ReminderKind = 'habits' | 'bedtime' | 'session' | 'hydration';

export interface ReminderSettings {
  habits: { enabled: boolean; time: string };
  bedtime: { enabled: boolean; offsetMin: number };
  session: { enabled: boolean; time: string };
  hydration: { enabled: boolean; intervalH: number };
}

/** Tout est éteint : on n'active pas des notifications dans le dos de quelqu'un. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  habits: { enabled: false, time: '20:30' },
  bedtime: { enabled: false, offsetMin: 30 },
  session: { enabled: false, time: '08:00' },
  hydration: { enabled: false, intervalH: 4 },
};

export interface PlannedReminder {
  /** `kind:AAAA-MM-JJ`, plus l'heure pour l'hydratation : stable d'un recalcul à l'autre. */
  id: string;
  kind: ReminderKind;
  at: ISODateString;
  /** De quoi composer le texte — la traduction se fait dans l'app. */
  params: Record<string, string | number>;
}

export interface ReminderInput {
  habits: Habit[];
  habitLogs: HabitLog[];
  workouts: Workout[];
  nutrition: NutritionEntry[];
  sleepSessions: SleepSession[];
  hydrationGoalMl: number;
  /** `computeCircadianProfile(...).value` — null quand il n'y a pas assez de nuits. */
  chronotype?: { idealBedtime: string; idealWake: string } | null;
}

export const REMINDER_WINDOW_DAYS = 7;
/** iOS n'en garde que 64 : on s'arrête avant, les plus proches d'abord. */
export const MAX_SCHEDULED_REMINDERS = 60;
export const HYDRATION_MAX_PER_DAY = 3;
/** Rien après cette heure, même si l'intervalle le permettrait. */
const HYDRATION_LATEST_HOUR = 20;
/** On arrête de faire boire ce nombre d'heures avant le coucher. */
const HYDRATION_STOP_BEFORE_BED_H = 2;
const DEFAULT_WAKE = '07:00';
const DEFAULT_BEDTIME = '23:00';
const HOUR_MS = 3_600_000;

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseHhmm = (hhmm: string): [number, number] => {
  const [h, m] = hhmm.split(':').map(Number);
  return [h ?? 0, m ?? 0];
};

/** L'instant local d'une heure « HH:MM » un jour donné — par composantes, donc juste les jours de changement d'heure. */
function atLocal(day: Date, hhmm: string): Date {
  const [h, m] = parseHhmm(hhmm);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/**
 * Le coucher d'un soir donné. Une heure idéale avant 4 h du matin appartient à
 * la nuit du jour précédent : « 01:00 » le mercredi, c'est mercredi soir, une
 * fois minuit passé.
 */
function bedtimeInstant(day: Date, hhmm: string): Date {
  const [h] = parseHhmm(hhmm);
  const at = atLocal(day, hhmm);
  if (h < 4) at.setDate(at.getDate() + 1);
  return at;
}

const sameLocalDay = (iso: string, day: Date): boolean => dayKey(new Date(iso)) === dayKey(day);

/**
 * Les habitudes encore dues ce jour-là. Une quotidienne compte tant qu'elle n'a
 * pas été validée ; une hebdomadaire seulement au dernier moment utile — quand
 * il ne reste pas plus de jours que d'occurrences à faire.
 */
function habitsDueOn(input: ReminderInput, day: Date): number {
  const active = input.habits.filter((h) => !h.archivedAt);
  let due = 0;
  for (const h of active) {
    if (h.cadence === 'daily') {
      const done = input.habitLogs.filter((l) => l.habitId === h.id && sameLocalDay(l.completedAt, day)).length;
      if (done < h.targetPerPeriod) due += 1;
      continue;
    }
    const { start, end, daysLeft } = weekBoundsOf(day);
    const done = input.habitLogs.filter((l) => {
      if (l.habitId !== h.id) return false;
      const t = new Date(l.completedAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    const remaining = h.targetPerPeriod - done;
    if (remaining > 0 && remaining >= daysLeft) due += 1;
  }
  return due;
}

/** L'heure de lever retenue : la fin de la nuit enregistrée ce jour-là, sinon le réveil idéal, sinon 7 h. */
function wakeInstant(input: ReminderInput, day: Date): Date {
  const night = input.sleepSessions.filter((s) => sameLocalDay(s.endedAt, day)).sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
  if (night) return new Date(night.endedAt);
  return atLocal(day, input.chronotype?.idealWake ?? DEFAULT_WAKE);
}

/** Eau bue ce jour-là, en millilitres. */
function hydrationOn(input: ReminderInput, day: Date): number {
  return input.nutrition
    .filter((e) => e.hydrationMl != null && sameLocalDay(e.loggedAt, day))
    .reduce((sum, e) => sum + (e.hydrationMl ?? 0), 0);
}

function hydrationReminders(input: ReminderInput, settings: ReminderSettings, day: Date): PlannedReminder[] {
  const wake = wakeInstant(input, day);
  const bed = bedtimeInstant(day, input.chronotype?.idealBedtime ?? DEFAULT_BEDTIME);
  const awakeMs = bed.getTime() - wake.getTime();
  if (awakeMs <= 0) return [];

  const lastAllowed = Math.min(bed.getTime() - HYDRATION_STOP_BEFORE_BED_H * HOUR_MS, atLocal(day, `${HYDRATION_LATEST_HOUR}:00`).getTime());
  const consumed = hydrationOn(input, day);
  const out: PlannedReminder[] = [];

  for (let slot = wake.getTime() + settings.hydration.intervalH * HOUR_MS; slot <= lastAllowed; slot += settings.hydration.intervalH * HOUR_MS) {
    if (out.length >= HYDRATION_MAX_PER_DAY) break;
    // Attendu à cette heure, au prorata de la journée éveillée : un créneau
    // déjà à jour ne mérite pas de rappel.
    const expected = input.hydrationGoalMl * ((slot - wake.getTime()) / awakeMs);
    if (consumed >= expected) continue;
    const time = new Date(slot);
    out.push({
      id: `hydration:${dayKey(day)}:${String(time.getHours()).padStart(2, '0')}${String(time.getMinutes()).padStart(2, '0')}`,
      kind: 'hydration',
      at: time.toISOString(),
      params: { remainingMl: Math.max(0, Math.round(input.hydrationGoalMl - consumed)) },
    });
  }
  return out;
}

/**
 * Les rappels des `days` prochains jours, du plus proche au plus lointain,
 * plafonnés à `max`. Rien dans le passé, rien pour une condition non remplie.
 */
export function plannedReminders(
  input: ReminderInput,
  settings: ReminderSettings,
  now: Date,
  days: number = REMINDER_WINDOW_DAYS,
  max: number = MAX_SCHEDULED_REMINDERS,
): PlannedReminder[] {
  const out: PlannedReminder[] = [];

  for (let i = 0; i < days; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dayKey(day);

    if (settings.habits.enabled) {
      const count = habitsDueOn(input, day);
      if (count > 0) out.push({ id: `habits:${key}`, kind: 'habits', at: atLocal(day, settings.habits.time).toISOString(), params: { count } });
    }

    if (settings.bedtime.enabled && input.chronotype) {
      const bed = bedtimeInstant(day, input.chronotype.idealBedtime);
      const at = new Date(bed.getTime() - settings.bedtime.offsetMin * 60_000);
      out.push({ id: `bedtime:${key}`, kind: 'bedtime', at: at.toISOString(), params: { bedtime: input.chronotype.idealBedtime, offsetMin: settings.bedtime.offsetMin } });
    }

    if (settings.session.enabled) {
      const session = input.workouts.find((w) => w.status === 'planned' && w.plannedFor && sameLocalDay(w.plannedFor, day));
      if (session) out.push({ id: `session:${key}`, kind: 'session', at: atLocal(day, settings.session.time).toISOString(), params: { name: session.name } });
    }

    if (settings.hydration.enabled) out.push(...hydrationReminders(input, settings, day));
  }

  return out
    .filter((r) => new Date(r.at).getTime() > now.getTime())
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, max);
}
