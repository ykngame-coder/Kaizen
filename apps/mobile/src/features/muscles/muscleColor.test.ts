import { describe, expect, it } from 'vitest';
import { recoveryAsOf } from './muscleColor';

/**
 * Régression : la carte « Récupération musculaire » du hub Sport et l'écran
 * Récupération montraient chaque muscle avec une couleur d'écart — bleu contre
 * vert, vert contre orange — à la même seconde et sur les mêmes données.
 *
 * Le hub calculait à partir du sélecteur de jour, qui porte 23:59:59.999, soit
 * treize heures dans le futur à 10 h 44. La récupération dépendant du temps
 * écoulé, tout paraissait plus frais d'un cran. « Lequel est le bon du coup ? »
 */
describe('recoveryAsOf', () => {
  const now = new Date(2026, 8, 9, 10, 44).toISOString();
  const endOfToday = new Date(2026, 8, 9, 23, 59, 59, 999).toISOString();

  it('ne calcule jamais la récupération dans le futur', () => {
    expect(recoveryAsOf(endOfToday, now)).toBe(now);
  });

  it('garde la fin d un jour passé, pour pouvoir le consulter', () => {
    const endOfYesterday = new Date(2026, 8, 8, 23, 59, 59, 999).toISOString();
    expect(recoveryAsOf(endOfYesterday, now)).toBe(endOfYesterday);
  });

  it('borne aussi un jour futur à maintenant', () => {
    const endOfTomorrow = new Date(2026, 8, 10, 23, 59, 59, 999).toISOString();
    expect(recoveryAsOf(endOfTomorrow, now)).toBe(now);
  });

  it('retombe sur maintenant si la date est illisible', () => {
    expect(recoveryAsOf('pas une date', now)).toBe(now);
  });
});
