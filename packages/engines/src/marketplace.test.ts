import { describe, expect, it } from 'vitest';
import type { Program } from '@supotsu/core';
import { generateProgramSchedule, programFit, recommendProgram } from './marketplace';

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
  sessionTemplates: p.sessionTemplates ?? [],
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

describe('generateProgramSchedule', () => {
  const withTemplates = program({
    id: 'p-sched',
    sessionsPerWeek: 3,
    sessionTemplates: [
      { title: 'A', exercises: [{ exerciseId: 'ex-back-squat', sets: 3, reps: 8 }] },
      { title: 'B', notes: 'Course facile 20 min.' },
      { title: 'C', exercises: [{ exerciseId: 'ex-push-up', sets: 2, reps: 10 }] },
    ],
  });

  it('produces one entry per session template', () => {
    const out = generateProgramSchedule(withTemplates, new Date('2026-08-17T10:00:00Z'));
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('starts after the given date, on Mon/Wed/Fri for a 3x/week program', () => {
    // 2026-08-17 is a Monday.
    const out = generateProgramSchedule(withTemplates, new Date('2026-08-17T10:00:00Z'));
    const weekday = (dateKey: string): number => new Date(`${dateKey}T12:00:00`).getDay();
    expect(out[0]!.plannedFor > '2026-08-17').toBe(true);
    for (const s of out) expect([1, 3, 5]).toContain(weekday(s.plannedFor));
  });

  it('expands sets×reps into individual set rows and carries free-text notes for exercise-less sessions', () => {
    const out = generateProgramSchedule(withTemplates, new Date('2026-08-17T10:00:00Z'));
    expect(out[0]!.sets).toEqual([
      { exerciseId: 'ex-back-squat', order: 0, reps: 8 },
      { exerciseId: 'ex-back-squat', order: 1, reps: 8 },
      { exerciseId: 'ex-back-squat', order: 2, reps: 8 },
    ]);
    expect(out[1]!.sets).toBeUndefined();
    expect(out[1]!.notes).toBe('Course facile 20 min.');
  });
});
