import { describe, expect, it } from 'vitest';

/**
 * La logique de jour des habitudes, isolée pour être vérifiable. Ces deux
 * fonctions sont dupliquées de HabitsScreen / DayNav : le test existe pour
 * prouver qu'elles restent d'accord entre elles — c'est précisément leur
 * désaccord qui ferait apparaître une coche sur le mauvais jour.
 */
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function noonOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
}

const DAY_MS = 86_400_000;

describe('jour consulté vs jour enregistré', () => {
  it('enregistre sur le jour affiché, pour chacun des sept derniers jours', () => {
    const today = new Date(2026, 8, 6, 10, 30);
    for (let back = 0; back < 7; back += 1) {
      const selected = endOfDayIso(new Date(today.getTime() - back * DAY_MS));
      const viewedK = dayKey(new Date(selected));
      const logged = noonOf(selected)!;
      expect(dayKey(new Date(logged))).toBe(viewedK);
    }
  });

  it('reste sur le bon jour même décalé de plusieurs heures', () => {
    // C'est tout l'intérêt de midi : 23:59:59.999 bascule au lendemain dès
    // qu'un décalage d'une heure s'applique, midi ne bouge pas.
    const selected = endOfDayIso(new Date(2026, 8, 4, 18, 0));
    const noon = new Date(noonOf(selected)!);
    for (const shiftHours of [-6, -3, -1, 1, 3, 6]) {
      const shifted = new Date(noon.getTime() + shiftHours * 3_600_000);
      expect(dayKey(shifted)).toBe(dayKey(noon));
    }
  });

  it('rejette une date invalide plutôt que de produire un horodatage bancal', () => {
    expect(noonOf('pas une date')).toBeNull();
  });

  it('recule bien d’un jour à chaque pas du sélecteur', () => {
    let cursor = endOfDayIso(new Date(2026, 8, 6, 9, 0));
    const seen: string[] = [dayKey(new Date(cursor))];
    for (let i = 0; i < 3; i += 1) {
      cursor = endOfDayIso(new Date(new Date(cursor).getTime() - DAY_MS));
      seen.push(dayKey(new Date(cursor)));
    }
    expect(seen).toEqual(['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03']);
  });
});
