import { describe, expect, it } from 'vitest';
import { formatBirthDate, normalizeBirthDate, parseBirthDate } from './birthDate';

const today = new Date('2026-09-15T10:00:00.000Z');

describe('parseBirthDate', () => {
  it('lit le format français et le format ISO', () => {
    expect(parseBirthDate('15/06/1990', today)).toBe('1990-06-15T12:00:00.000Z');
    expect(parseBirthDate('5/6/1990', today)).toBe('1990-06-05T12:00:00.000Z');
    expect(parseBirthDate('15-06-1990', today)).toBe('1990-06-15T12:00:00.000Z');
    expect(parseBirthDate('1990-06-15', today)).toBe('1990-06-15T12:00:00.000Z');
    expect(parseBirthDate('  15.06.1990 ', today)).toBe('1990-06-15T12:00:00.000Z');
  });

  it('refuse une date qui n existe pas', () => {
    expect(parseBirthDate('31/02/1990', today)).toBeNull();
    expect(parseBirthDate('15/13/1990', today)).toBeNull();
    expect(parseBirthDate('bientôt', today)).toBeNull();
  });

  it('refuse un âge invraisemblable', () => {
    expect(parseBirthDate('15/06/2020', today)).toBeNull(); // 6 ans
    expect(parseBirthDate('15/06/1900', today)).toBeNull();
    expect(parseBirthDate('15/06/2030', today)).toBeNull();
  });
});

describe('formatBirthDate', () => {
  it('affiche JJ/MM/AAAA sur le bon jour, quel que soit le fuseau', () => {
    expect(formatBirthDate('1990-06-15T12:00:00.000Z')).toBe('15/06/1990');
  });
});

describe('normalizeBirthDate', () => {
  it('garde le jour civil d une date locale, à midi UTC', () => {
    // Minuit local le 15 juin : en UTC+2 c'est encore le 14 à 22 h.
    expect(normalizeBirthDate(new Date(1990, 5, 15, 0, 0))).toBe('1990-06-15T12:00:00.000Z');
  });
});
