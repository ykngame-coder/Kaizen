import { describe, expect, it } from 'vitest';
import type { Goal } from '@supotsu/core';
import { resolveGoal, resolvedGoalProgress } from './goalResolution';
import type { TrendPoint } from './progression';

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  userId: 'u1',
  createdAt: '2026-08-29T23:40:00.000Z',
  updatedAt: '2026-09-17T20:11:00.000Z',
  type: 'body_composition',
  title: 'Descendre sous la barre des 100 kg',
  priority: 'primary',
  targetValue: 97,
  targetUnit: 'kg',
  currentValue: 103.7,
  status: 'active',
  progress: 0,
  ...over,
});

const weights: TrendPoint[] = [
  { date: '2026-08-29T07:00:00.000Z', value: 105 },
  { date: '2026-09-10T07:00:00.000Z', value: 104.4 },
  { date: '2026-09-17T07:00:00.000Z', value: 103.7 },
];

describe('resolveGoal', () => {
  it('reconstitue le départ à partir de la pesée du jour de création', () => {
    expect(resolveGoal(goal(), weights).startValue).toBe(105);
  });

  it('moyenne les pesées de la semaine entourant la création, bruit de balance compris', () => {
    const noisy: TrendPoint[] = [
      { date: '2026-08-27T07:00:00.000Z', value: 104 },
      { date: '2026-08-29T07:00:00.000Z', value: 108 },
      { date: '2026-08-29T20:00:00.000Z', value: 103 },
      { date: '2026-09-17T07:00:00.000Z', value: 103.7 },
    ];
    expect(resolveGoal(goal(), noisy).startValue).toBe(105);
  });

  it('suit le poids réel sans attendre une saisie', () => {
    const resolved = resolveGoal(goal({ currentValue: 103.7 }), [...weights, { date: '2026-09-18T07:00:00.000Z', value: 102.9 }]);
    expect(resolved.currentValue).toBe(102.9);
  });

  it('respecte un départ déjà enregistré', () => {
    expect(resolveGoal(goal({ startValue: 110 }), weights).startValue).toBe(110);
  });

  it('ne touche pas à un objectif qui n est pas un poids', () => {
    const perf = goal({ type: 'performance', targetUnit: 'km', currentValue: 5 });
    expect(resolveGoal(perf, weights)).toEqual(perf);
  });

  it('se contente de ce qu il a quand aucune pesée n existe', () => {
    const g = goal();
    expect(resolveGoal(g, [])).toEqual(g);
  });

  it('ne reconstitue pas un départ à partir d une pesée trop éloignée de la création', () => {
    const old = goal({ createdAt: '2026-05-01T00:00:00.000Z' });
    expect(resolveGoal(old, weights).startValue).toBeUndefined();
  });
});

describe('resolvedGoalProgress', () => {
  it('rend la progression réelle là où la barre restait à zéro', () => {
    // 105 → 103.7 sur 105 → 97 : 1.3 kg perdus sur 8.
    expect(Math.round(resolvedGoalProgress(goal(), weights) * 100)).toBe(16);
  });

  it('reste à zéro tant que le poids remonte, sans jamais passer sous zéro', () => {
    const up: TrendPoint[] = [
      { date: '2026-08-29T07:00:00.000Z', value: 105 },
      { date: '2026-09-17T07:00:00.000Z', value: 106.2 },
    ];
    expect(resolvedGoalProgress(goal(), up)).toBe(0);
  });

  it('atteint 100 % une fois la cible franchie', () => {
    const done: TrendPoint[] = [
      { date: '2026-08-29T07:00:00.000Z', value: 105 },
      { date: '2026-09-17T07:00:00.000Z', value: 96.4 },
    ];
    expect(resolvedGoalProgress(goal(), done)).toBe(1);
  });

  it('retombe sur la progression enregistrée pour un objectif sans cible', () => {
    expect(resolvedGoalProgress(goal({ targetValue: undefined, progress: 0.4 }), weights)).toBe(0.4);
  });
});
