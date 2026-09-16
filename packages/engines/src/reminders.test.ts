import { afterAll, describe, expect, it } from 'vitest';
import type { Habit, HabitLog, NutritionEntry, SleepSession, Workout } from '@supotsu/core';
import { DEFAULT_REMINDER_SETTINGS, plannedReminders, type ReminderInput, type ReminderSettings } from './reminders';

// Fixé avant de construire les données : elles sont calculées au chargement.
const originalTz = process.env.TZ;
process.env.TZ = 'Europe/Paris';
afterAll(() => {
  process.env.TZ = originalTz;
});

/** Heure locale. */
const at = (d: number, h: number, mi = 0): Date => new Date(2026, 8, d, h, mi);
const iso = (d: number, h: number, mi = 0): string => at(d, h, mi).toISOString();

const habit = (id: string, over: Partial<Habit> = {}): Habit =>
  ({ id, userId: 'u1', name: id, pillar: 'sport', cadence: 'daily', targetPerPeriod: 1, createdAt: iso(1, 8), updatedAt: iso(1, 8), ...over }) as Habit;
const log = (habitId: string, completedAt: string): HabitLog =>
  ({ id: `l-${habitId}-${completedAt}`, userId: 'u1', habitId, completedAt, createdAt: completedAt, updatedAt: completedAt }) as HabitLog;
const water = (ml: number, loggedAt: string): NutritionEntry =>
  ({ id: `w-${loggedAt}`, userId: 'u1', mealType: 'snack', description: 'Eau', kcal: 0, hydrationMl: ml, source: 'manual', loggedAt, createdAt: loggedAt, updatedAt: loggedAt }) as NutritionEntry;
const night = (wakeDay: number, wakeHour: number): SleepSession =>
  ({ id: `s-${wakeDay}`, userId: 'u1', source: 'apple_health', startedAt: iso(wakeDay - 1, 23), endedAt: iso(wakeDay, wakeHour), deepMin: 60, lightMin: 240, remMin: 90, awakeMin: 10, asleepMin: 390, inBedMin: 400, createdAt: iso(wakeDay, wakeHour), updatedAt: iso(wakeDay, wakeHour) }) as SleepSession;
const planned = (day: number, name: string): Workout =>
  ({ id: `w-${day}`, userId: 'u1', name, status: 'planned', plannedFor: iso(day, 12), createdAt: iso(1, 8), updatedAt: iso(1, 8) }) as Workout;

const EMPTY: ReminderInput = {
  habits: [],
  habitLogs: [],
  workouts: [],
  nutrition: [],
  sleepSessions: [],
  hydrationGoalMl: 2500,
  chronotype: { idealBedtime: '23:15', idealWake: '07:00' },
};

const ALL_ON: ReminderSettings = {
  habits: { enabled: true, time: '20:30' },
  bedtime: { enabled: true, offsetMin: 30 },
  session: { enabled: true, time: '08:00' },
  hydration: { enabled: true, intervalH: 4 },
};

const NOW = at(16, 9); // mercredi 16 septembre 2026, 9 h locales
const kinds = (rs: { kind: string }[]): string[] => [...new Set(rs.map((r) => r.kind))].sort();
const on = (rs: { at: string }[], day: number): string[] =>
  rs.filter((r) => new Date(r.at).getDate() === day).map((r) => new Date(r.at).toTimeString().slice(0, 5));

describe('plannedReminders', () => {
  it('ne programme rien quand tout est désactivé', () => {
    expect(plannedReminders({ ...EMPTY, habits: [habit('h1')] }, DEFAULT_REMINDER_SETTINGS, NOW)).toEqual([]);
  });

  it('habitudes : programmé tant qu une quotidienne manque, plus rien quand tout est coché', () => {
    const input = { ...EMPTY, habits: [habit('h1'), habit('h2')], habitLogs: [log('h1', iso(16, 8))] };
    const today = plannedReminders(input, ALL_ON, NOW).filter((r) => r.kind === 'habits' && new Date(r.at).getDate() === 16);
    expect(today).toHaveLength(1);
    expect(today[0]?.params.count).toBe(1);

    const done = { ...input, habitLogs: [log('h1', iso(16, 8)), log('h2', iso(16, 8))] };
    expect(plannedReminders(done, ALL_ON, NOW).filter((r) => r.kind === 'habits' && new Date(r.at).getDate() === 16)).toEqual([]);
  });

  it('habitudes hebdomadaires : seulement au dernier moment utile', () => {
    // 3 fois par semaine, rien de fait : mercredi il reste 5 jours pour 3 fois → pas encore urgent.
    const weekly = [habit('w1', { cadence: 'weekly', targetPerPeriod: 3 })];
    const wed = plannedReminders({ ...EMPTY, habits: weekly }, ALL_ON, NOW).filter((r) => r.kind === 'habits' && new Date(r.at).getDate() === 16);
    expect(wed).toEqual([]);
    // Vendredi, il ne reste que 3 jours (ven, sam, dim) pour 3 fois → il faut s'y mettre.
    const fri = plannedReminders({ ...EMPTY, habits: weekly }, ALL_ON, NOW).filter((r) => r.kind === 'habits' && new Date(r.at).getDate() === 18);
    expect(fri).toHaveLength(1);
  });

  it('coucher : 30 min avant l heure idéale, et rien sans chronotype', () => {
    const withBed = plannedReminders(EMPTY, ALL_ON, NOW).filter((r) => r.kind === 'bedtime' && new Date(r.at).getDate() === 16);
    expect(on(withBed, 16)).toEqual(['22:45']);
    expect(withBed[0]?.params.bedtime).toBe('23:15');
    expect(plannedReminders({ ...EMPTY, chronotype: null }, ALL_ON, NOW).filter((r) => r.kind === 'bedtime')).toEqual([]);
  });

  it('séance : le jour d une séance planifiée, pas si elle est terminée', () => {
    const input = { ...EMPTY, workouts: [planned(17, 'Haut du corps')] };
    const r = plannedReminders(input, ALL_ON, NOW).filter((x) => x.kind === 'session');
    expect(r).toHaveLength(1);
    expect(new Date(r[0]!.at).getDate()).toBe(17);
    expect(r[0]?.params.name).toBe('Haut du corps');

    const done = { ...EMPTY, workouts: [{ ...planned(17, 'Haut du corps'), status: 'completed' } as Workout] };
    expect(plannedReminders(done, ALL_ON, NOW).filter((x) => x.kind === 'session')).toEqual([]);
  });

  it('hydratation : lever + intervalle, arrêt 2 h avant le coucher, jamais après 20 h, 3 par jour au maximum', () => {
    // Nuit finie à 6 h le 17 → 10 h, 14 h, 18 h. 22 h serait après 20 h, et après
    // l'arrêt 2 h avant le coucher (23:15).
    const woke6 = plannedReminders({ ...EMPTY, sleepSessions: [night(17, 6)] }, ALL_ON, NOW).filter((r) => r.kind === 'hydration' && new Date(r.at).getDate() === 17);
    expect(on(woke6, 17)).toEqual(['10:00', '14:00', '18:00']);
    // Sans nuit enregistrée, le lever vient du chronotype (07:00) → 11 h, 15 h, 19 h.
    const noNight = plannedReminders(EMPTY, ALL_ON, NOW).filter((r) => r.kind === 'hydration' && new Date(r.at).getDate() === 17);
    expect(on(noNight, 17)).toEqual(['11:00', '15:00', '19:00']);
  });

  it('hydratation : un créneau déjà à jour n est pas programmé', () => {
    // Aujourd'hui : lever 7 h, coucher 23:15, objectif 2,5 L. Au prorata, on
    // attend ~0,6 L à 11 h, ~1,2 L à 15 h, ~1,8 L à 19 h.
    const drank1L = plannedReminders({ ...EMPTY, nutrition: [water(1000, iso(16, 8))] }, ALL_ON, NOW)
      .filter((r) => r.kind === 'hydration' && new Date(r.at).getDate() === 16);
    expect(on(drank1L, 16)).toEqual(['15:00', '19:00']); // 11 h : déjà à jour
    expect(drank1L[0]?.params.remainingMl).toBe(1500);
    // Déjà 2 L : plus aucun créneau de la journée n'est en retard.
    const drank2L = plannedReminders({ ...EMPTY, nutrition: [water(2000, iso(16, 8))] }, ALL_ON, NOW)
      .filter((r) => r.kind === 'hydration' && new Date(r.at).getDate() === 16);
    expect(drank2L).toEqual([]);
  });

  it('couvre 7 jours et ne programme jamais dans le passé', () => {
    const all = plannedReminders({ ...EMPTY, habits: [habit('h1')] }, ALL_ON, NOW);
    expect(all.every((r) => new Date(r.at).getTime() > NOW.getTime())).toBe(true);
    const days = new Set(all.map((r) => new Date(r.at).getDate()));
    expect(Math.max(...days) - Math.min(...days)).toBeLessThanOrEqual(7);
    expect(kinds(all)).toEqual(['bedtime', 'habits', 'hydration']);
    // 8 h du matin est déjà passé aujourd'hui : pas de rappel de séance rétroactif.
    expect(all.some((r) => new Date(r.at).getTime() <= NOW.getTime())).toBe(false);
  });

  it('garde les heures locales au passage à l heure d hiver', () => {
    // Le 25 octobre 2026, la France recule d'une heure.
    const now = new Date(2026, 9, 23, 9);
    const all = plannedReminders({ ...EMPTY, habits: [habit('h1')] }, ALL_ON, now).filter((r) => r.kind === 'habits');
    expect(all.map((r) => new Date(r.at).toTimeString().slice(0, 5))).toEqual(Array(7).fill('20:30'));
  });

  it('plafonne le nombre de rappels programmés, les plus proches d abord', () => {
    const many = { ...EMPTY, habits: [habit('h1')], workouts: Array.from({ length: 7 }, (_, i) => planned(17 + i, `S${i}`)) };
    const all = plannedReminders(many, ALL_ON, NOW, 7, 5);
    expect(all).toHaveLength(5);
    const times = all.map((r) => new Date(r.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
