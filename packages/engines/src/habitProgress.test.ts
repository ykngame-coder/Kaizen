import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '@supotsu/core';
import { habitExistedOn, habitProgressOn, habitSatisfiedOn, indexHabitLogs, weekBoundsOf } from './habitProgress';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  userId: 'u1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Séance',
  pillar: 'performance',
  cadence: 'weekly',
  targetPerPeriod: 3,
  ...over,
});

/** Un log à midi, heure locale — l'heure ne doit jamais faire basculer de jour. */
const log = (day: string, id = 'l'): HabitLog => ({
  id,
  userId: 'u1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  habitId: 'h1',
  completedAt: new Date(`${day}T12:00:00`).toISOString(),
});

const D = (day: string): Date => new Date(`${day}T12:00:00`);

describe('weekBoundsOf', () => {
  it('commence le lundi, et compte les jours restants ce jour compris', () => {
    // 2026-09-17 est un jeudi.
    const { start, daysLeft } = weekBoundsOf(D('2026-09-17'));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(14);
    expect(daysLeft).toBe(4); // jeudi, vendredi, samedi, dimanche
  });

  it('rattache le dimanche à la semaine qui s achève', () => {
    const { start, daysLeft } = weekBoundsOf(D('2026-09-20'));
    expect(start.getDate()).toBe(14);
    expect(daysLeft).toBe(1);
  });
});

describe('habitProgressOn', () => {
  it('compte une quotidienne sur la journée', () => {
    const idx = indexHabitLogs([log('2026-09-17', 'a'), log('2026-09-17', 'b'), log('2026-09-16', 'c')]);
    const p = habitProgressOn(habit({ cadence: 'daily', targetPerPeriod: 2 }), idx, D('2026-09-17'));
    expect(p).toMatchObject({ count: 2, target: 2, done: true, period: 'day' });
  });

  it('compte une hebdomadaire sur toute sa semaine, pas sur la journée', () => {
    const idx = indexHabitLogs([log('2026-09-14', 'a'), log('2026-09-16', 'b')]);
    const p = habitProgressOn(habit(), idx, D('2026-09-17'));
    expect(p).toMatchObject({ count: 2, target: 3, done: false, period: 'week' });
  });

  it('tient une hebdomadaire pour faite le reste de la semaine, sans rien demander de plus', () => {
    const idx = indexHabitLogs([log('2026-09-14', 'a'), log('2026-09-15', 'b'), log('2026-09-16', 'c')]);
    const p = habitProgressOn(habit(), idx, D('2026-09-17'));
    expect(p).toMatchObject({ count: 3, done: true });
  });

  it('ne compte pas les validations de la semaine précédente', () => {
    const idx = indexHabitLogs([log('2026-09-13', 'a'), log('2026-09-12', 'b'), log('2026-09-11', 'c')]);
    expect(habitProgressOn(habit(), idx, D('2026-09-17')).count).toBe(0);
  });

  it('ignore une cible absurde plutôt que de rendre l habitude invalidable', () => {
    const idx = indexHabitLogs([log('2026-09-17')]);
    expect(habitProgressOn(habit({ cadence: 'daily', targetPerPeriod: 0 }), idx, D('2026-09-17')).done).toBe(true);
  });
});

describe('habitExistedOn', () => {
  it('compte le jour de création, pas ceux d avant', () => {
    const h = habit({ createdAt: '2026-09-16T08:00:00.000Z' });
    expect(habitExistedOn(h, D('2026-09-16'))).toBe(true);
    expect(habitExistedOn(h, D('2026-09-15'))).toBe(false);
  });
});

describe('habitSatisfiedOn', () => {
  const h = habit({ targetPerPeriod: 1 });

  it('ne casse pas la série des jours où la cible hebdomadaire est déjà atteinte', () => {
    const idx = indexHabitLogs([log('2026-09-16')]);
    // Mercredi validé : mardi et jeudi de la même semaine comptent aussi.
    expect(habitSatisfiedOn(h, idx, D('2026-09-15'), D('2026-09-17'))).toBe(true);
    expect(habitSatisfiedOn(h, idx, D('2026-09-17'), D('2026-09-17'))).toBe(true);
  });

  it('laisse le bénéfice du doute tant que la semaine en cours reste jouable', () => {
    const idx = indexHabitLogs([]);
    // Lundi matin, rien n'est fait : une hebdomadaire ne doit pas déjà compter
    // comme manquée — il reste six jours pour la tenir.
    expect(habitSatisfiedOn(h, idx, D('2026-09-14'), D('2026-09-14'))).toBe(true);
  });

  it('la compte manquée dès qu il ne reste plus assez de jours', () => {
    const idx = indexHabitLogs([]);
    // Dimanche, cible 1, rien de fait : la semaine ne peut plus être sauvée.
    expect(habitSatisfiedOn(habit({ targetPerPeriod: 2 }), idx, D('2026-09-20'), D('2026-09-20'))).toBe(false);
  });

  it('tranche définitivement une semaine révolue', () => {
    const idx = indexHabitLogs([log('2026-09-07')]);
    expect(habitSatisfiedOn(h, idx, D('2026-09-08'), D('2026-09-17'))).toBe(true);
    expect(habitSatisfiedOn(h, indexHabitLogs([]), D('2026-09-08'), D('2026-09-17'))).toBe(false);
  });

  it('juge une quotidienne sur sa seule journée', () => {
    const daily = habit({ cadence: 'daily', targetPerPeriod: 1 });
    const idx = indexHabitLogs([log('2026-09-16')]);
    expect(habitSatisfiedOn(daily, idx, D('2026-09-16'), D('2026-09-17'))).toBe(true);
    expect(habitSatisfiedOn(daily, idx, D('2026-09-15'), D('2026-09-17'))).toBe(false);
  });

  it('ne pénalise pas une habitude créée après le jour regardé', () => {
    const late = habit({ cadence: 'daily', targetPerPeriod: 1, createdAt: '2026-09-16T08:00:00.000Z' });
    expect(habitSatisfiedOn(late, indexHabitLogs([]), D('2026-09-10'), D('2026-09-17'))).toBe(true);
  });
});
