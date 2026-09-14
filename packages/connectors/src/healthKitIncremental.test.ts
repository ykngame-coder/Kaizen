import { afterAll, describe, expect, it } from 'vitest';
import { dayKeysRange, recomputeSleep, sleepRereadWindow, touchedDayKeys } from './healthKitIncremental';

// Fixé AVANT de construire les données : elles sont calculées au chargement
// du fichier, pas dans un beforeEach.
const originalTz = process.env.TZ;
process.env.TZ = 'Europe/Paris';
afterAll(() => {
  process.env.TZ = originalTz;
});

// Heure locale de Paris, construite depuis ses composantes.
const at = (m: number, d: number, h: number, mi = 0): string => new Date(2026, m - 1, d, h, mi).toISOString();

describe('touchedDayKeys', () => {
  it('rend le jour local de chaque intervalle', () => {
    expect(touchedDayKeys([{ startDate: at(7, 21, 10), endDate: at(7, 21, 11) }])).toEqual(['2026-07-21']);
  });

  it('un intervalle à cheval sur minuit touche les deux jours', () => {
    expect(touchedDayKeys([{ startDate: at(7, 21, 23, 30), endDate: at(7, 22, 0, 30) }])).toEqual(['2026-07-21', '2026-07-22']);
  });

  it('un intervalle qui finit pile à minuit ne touche pas le lendemain', () => {
    expect(touchedDayKeys([{ startDate: at(7, 21, 23), endDate: at(7, 22, 0) }])).toEqual(['2026-07-21']);
  });

  it('dédoublonne et trie', () => {
    const out = touchedDayKeys([
      { startDate: at(7, 22, 9), endDate: at(7, 22, 10) },
      { startDate: at(7, 20, 9), endDate: at(7, 20, 10) },
      { startDate: at(7, 22, 15), endDate: at(7, 22, 16) },
    ]);
    expect(out).toEqual(['2026-07-20', '2026-07-22']);
  });

  it('traverse le passage à l heure d été sans sauter de jour', () => {
    expect(touchedDayKeys([{ startDate: at(3, 28, 22), endDate: at(3, 30, 8) }])).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });
});

describe('dayKeysRange', () => {
  it('va de minuit du premier jour à minuit après le dernier', () => {
    const r = dayKeysRange(['2026-07-20', '2026-07-22']);
    expect(r.from).toEqual(new Date(2026, 6, 20));
    expect(r.to).toEqual(new Date(2026, 6, 23));
  });
});

describe('sleepRereadWindow', () => {
  it('élargit de 36 h de part et d autre des ajouts', () => {
    const w = sleepRereadWindow([
      { startDate: at(7, 21, 2), endDate: at(7, 21, 3) },
      { startDate: at(7, 21, 5), endDate: at(7, 21, 6) },
    ]);
    expect(w?.from.getTime()).toBe(new Date(at(7, 21, 2)).getTime() - 36 * 3600 * 1000);
    expect(w?.to.getTime()).toBe(new Date(at(7, 21, 6)).getTime() + 36 * 3600 * 1000);
  });

  it('rend null sans ajout', () => {
    expect(sleepRereadWindow([])).toBeNull();
  });
});

describe('recomputeSleep', () => {
  // Nuit du 20→21, sieste le 21 à 15 h, nuit du 21→22.
  const samples = [
    { value: 3, startDate: at(7, 20, 23), endDate: at(7, 21, 7) },
    { value: 3, startDate: at(7, 21, 15), endDate: at(7, 21, 16) },
    { value: 3, startDate: at(7, 21, 23), endDate: at(7, 22, 6) },
  ];
  const window = { from: new Date(at(7, 19, 12)), to: new Date(at(7, 23, 12)) };

  it('ne garde que les sessions qui contiennent un ajout', () => {
    const added = [{ startDate: at(7, 21, 23), endDate: at(7, 22, 6) }];
    const r = recomputeSleep(samples, added, window);
    expect(r.sessions.map((s) => s.startedAt)).toEqual([at(7, 21, 23)]);
    expect(r.replace).toEqual({ from: at(7, 21, 23), to: new Date(new Date(at(7, 22, 6)).getTime() + 1).toISOString() });
  });

  it('recalcule la durée du jour de réveil en comptant la sieste non touchée', () => {
    const added = [{ startDate: at(7, 20, 23), endDate: at(7, 21, 7) }];
    const r = recomputeSleep(samples, added, window);
    const day21 = r.durations.find((m) => m.measuredAt === new Date(2026, 6, 21, 12).toISOString());
    expect(day21?.value).toBe(9); // 8 h de nuit + 1 h de sieste
    // Le 22 n'est le jour de réveil d'aucune session touchée : pas réécrit.
    expect(r.durations).toHaveLength(1);
  });

  it('ne réécrit pas la durée d un jour que la fenêtre ne couvre pas en entier', () => {
    const added = [{ startDate: at(7, 21, 23), endDate: at(7, 22, 6) }];
    const tight = { from: new Date(at(7, 21, 20)), to: new Date(at(7, 22, 10)) };
    const r = recomputeSleep(samples.slice(2), added, tight);
    expect(r.sessions).toHaveLength(1);
    expect(r.durations).toEqual([]);
  });

  it('ne remplace rien quand aucune session n est touchée', () => {
    const r = recomputeSleep(samples, [{ startDate: at(7, 23, 1), endDate: at(7, 23, 2) }], window);
    expect(r).toEqual({ sessions: [], durations: [], replace: null });
  });
});
