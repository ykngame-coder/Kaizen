import { describe, expect, it } from 'vitest';
import { dayKeyOf, selectedDayFrom, selectedDayToday, shiftDay } from './day';

describe('dayKeyOf', () => {
  it('rend le jour LOCAL, pas le jour UTC', () => {
    // 00:30 heure locale : en UTC+2 c'est encore la veille à 22:30.
    const justAfterMidnight = new Date(2026, 8, 9, 0, 30);
    expect(dayKeyOf(justAfterMidnight)).toBe('2026-09-09');
    // 23:30 heure locale : en UTC-5 c'est déjà le lendemain à 04:30.
    const justBeforeMidnight = new Date(2026, 8, 9, 23, 30);
    expect(dayKeyOf(justBeforeMidnight)).toBe('2026-09-09');
  });

  it('accepte aussi une chaîne ISO', () => {
    expect(dayKeyOf(new Date(2026, 0, 5, 12).toISOString())).toBe('2026-01-05');
  });

  it('remplit les zéros', () => {
    expect(dayKeyOf(new Date(2026, 0, 1, 12))).toBe('2026-01-01');
  });
});

describe('selectedDayFrom', () => {
  const day = selectedDayFrom('2026-09-09');

  it('porte les trois instants du même jour', () => {
    expect(dayKeyOf(day.startOfDay)).toBe('2026-09-09');
    expect(dayKeyOf(day.noon)).toBe('2026-09-09');
    expect(dayKeyOf(day.endOfDay)).toBe('2026-09-09');
  });

  it('les ordonne', () => {
    expect(new Date(day.startOfDay).getTime()).toBeLessThan(new Date(day.noon).getTime());
    expect(new Date(day.noon).getTime()).toBeLessThan(new Date(day.endOfDay).getTime());
  });

  it('fait l aller-retour sur une année entière, y compris au changement d heure', () => {
    // L'invariant que le 23:59:59.999 cassait sur fuseau négatif.
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(2026, 0, 1 + i, 12);
      const key = dayKeyOf(d);
      expect(dayKeyOf(selectedDayFrom(key).endOfDay)).toBe(key);
      expect(dayKeyOf(selectedDayFrom(key).startOfDay)).toBe(key);
      expect(dayKeyOf(selectedDayFrom(key).noon)).toBe(key);
    }
  });

  it('traverse les fins de mois et d année', () => {
    expect(selectedDayFrom('2026-12-31').key).toBe('2026-12-31');
    expect(dayKeyOf(selectedDayFrom('2026-02-28').endOfDay)).toBe('2026-02-28');
  });
});

describe('isToday', () => {
  it('est vrai aujourd hui, faux la veille et le lendemain', () => {
    const today = dayKeyOf(new Date());
    expect(selectedDayFrom(today).isToday).toBe(true);
    expect(selectedDayToday().isToday).toBe(true);
    expect(selectedDayFrom(dayKeyOf(new Date(Date.now() - 86_400_000))).isToday).toBe(false);
    expect(selectedDayFrom(dayKeyOf(new Date(Date.now() + 86_400_000))).isToday).toBe(false);
  });
});

describe('shiftDay', () => {
  it('avance et recule d un jour civil', () => {
    expect(shiftDay(selectedDayFrom('2026-09-09'), 1).key).toBe('2026-09-10');
    expect(shiftDay(selectedDayFrom('2026-09-09'), -1).key).toBe('2026-09-08');
  });

  it('traverse un changement de mois et d année', () => {
    expect(shiftDay(selectedDayFrom('2026-08-31'), 1).key).toBe('2026-09-01');
    expect(shiftDay(selectedDayFrom('2026-01-01'), -1).key).toBe('2025-12-31');
  });

  it('avance d un jour civil même quand le jour ne dure pas 24 h', () => {
    // Passage à l'heure d'hiver en France : nuit du 24 au 25 octobre 2026.
    // Ajouter 86 400 000 ms donnerait ici le mauvais jour ou la mauvaise heure.
    expect(shiftDay(selectedDayFrom('2026-10-24'), 1).key).toBe('2026-10-25');
    expect(shiftDay(selectedDayFrom('2026-10-25'), 1).key).toBe('2026-10-26');
  });
});
