import { describe, expect, it } from 'vitest';
import { programSessionDates, type ProgramSessionLink } from './programSchedule';

const link = (weekNumber: number, order: number, sessionId = `s${weekNumber}-${order}`): ProgramSessionLink => ({
  weekNumber,
  order,
  sessionId,
});

/** Mardi 2026-09-22 — la date est choisie à la main (écran d'inscription), donc la semaine de départ est SA semaine, pas la suivante. */
const TUESDAY = new Date(2026, 8, 22, 9, 0, 0);

describe('programSessionDates', () => {
  it('démarre au lundi de la semaine choisie et répartit la semaine selon son nombre de séances', () => {
    const out = programSessionDates([link(1, 0), link(1, 1), link(1, 2)], TUESDAY);
    // Lundi 21, mercredi 23, vendredi 25 — la semaine de mardi 22, pas celle d'après.
    expect(out.map((s) => s.plannedFor)).toEqual(['2026-09-21', '2026-09-23', '2026-09-25']);
  });

  it('espace une semaine à deux séances plutôt que de les coller', () => {
    const out = programSessionDates([link(1, 0), link(1, 1)], TUESDAY);
    expect(out.map((s) => s.plannedFor)).toEqual(['2026-09-21', '2026-09-24']);
  });

  it('respecte le rythme propre à chaque semaine', () => {
    const links = [link(1, 0), link(1, 1), link(2, 0), link(2, 1), link(2, 2)];
    const out = programSessionDates(links, TUESDAY);
    expect(out.map((s) => s.plannedFor)).toEqual([
      '2026-09-21', '2026-09-24', // semaine 1 : deux séances
      '2026-09-28', '2026-09-30', '2026-10-02', // semaine 2 : trois séances
    ]);
  });

  it('garde une semaine vide sans décaler les suivantes', () => {
    const out = programSessionDates([link(1, 0), link(3, 0)], TUESDAY);
    expect(out.map((s) => s.plannedFor)).toEqual(['2026-09-21', '2026-10-05']);
  });

  it('range les liens désordonnés avant de dater', () => {
    const out = programSessionDates([link(2, 0), link(1, 1), link(1, 0)], TUESDAY);
    expect(out.map((s) => s.sessionId)).toEqual(['s1-0', 's1-1', 's2-0']);
  });

  it('reste sur la même semaine même quand on choisit un dimanche', () => {
    const sunday = new Date(2026, 8, 27, 20, 0, 0);
    expect(programSessionDates([link(1, 0)], sunday)[0]!.plannedFor).toBe('2026-09-21');
  });

  it('reste sur ce jour-là quand la date choisie est déjà un lundi', () => {
    const monday = new Date(2026, 8, 21, 8, 0, 0);
    expect(programSessionDates([link(1, 0)], monday)[0]!.plannedFor).toBe('2026-09-21');
  });

  it('ne rend rien pour un programme sans séance', () => {
    expect(programSessionDates([], TUESDAY)).toEqual([]);
  });
});
