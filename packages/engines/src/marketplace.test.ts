import { describe, expect, it } from 'vitest';
import type { Program } from '@supotsu/core';
import { programFit, recommendProgram } from './marketplace';

const ASOF = '2026-07-20T12:00:00.000Z';

const program = (p: Partial<Program> & { id: string }): Program => ({
  id: p.id,
  title: p.title ?? p.id,
  author: p.author ?? 'Coach',
  focus: p.focus ?? 'general',
  level: p.level ?? 'intermediate',
  weeks: p.weeks ?? 8,
  sessionsPerWeek: p.sessionsPerWeek ?? 3,
  description: p.description ?? '',
  priceCents: p.priceCents ?? 0,
});

const P_STR = program({ id: 'p-str', focus: 'strength', level: 'intermediate', sessionsPerWeek: 4 });
const PROGRAMS: Program[] = [
  P_STR,
  program({ id: 'p-end', focus: 'endurance', level: 'beginner', sessionsPerWeek: 3 }),
  program({ id: 'p-hyrox', focus: 'hyrox', level: 'advanced', sessionsPerWeek: 5 }),
];

describe('programFit', () => {
  it('rewards matching focus and level', () => {
    const match = programFit({ level: 'intermediate', goalFocus: 'strength' }, P_STR);
    const mismatch = programFit({ level: 'beginner', goalFocus: 'endurance' }, P_STR);
    expect(match).toBeGreaterThan(mismatch);
  });

  it('penalizes programs that exceed weekly availability', () => {
    const fits = programFit({ weeklyAvailability: 5 }, P_STR);
    const overloads = programFit({ weeklyAvailability: 2 }, P_STR);
    expect(fits).toBeGreaterThan(overloads);
  });
});

describe('recommendProgram', () => {
  it('returns null with an empty catalogue', () => {
    expect(recommendProgram({}, [], ASOF).value).toBeNull();
  });

  it('picks the program matching the goal focus', () => {
    const r = recommendProgram({ level: 'beginner', goalFocus: 'endurance' }, PROGRAMS, ASOF);
    expect(r.value?.id).toBe('p-end');
    expect(r.confidence).toBe('high');
    expect(r.explanation).toBeDefined();
  });

  it('is to_confirm without any profile signal', () => {
    expect(recommendProgram({}, PROGRAMS, ASOF).confidence).toBe('to_confirm');
  });
});
