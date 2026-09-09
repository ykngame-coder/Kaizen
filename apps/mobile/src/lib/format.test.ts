import { describe, expect, it } from 'vitest';
import { activityTitle, splitDuration } from './format';

/**
 * Régression : « 3 h 60 » affiché dans « Cette semaine ». L'heure et les
 * minutes étaient calculées séparément — `Math.floor(sec/3600)` d'un côté,
 * `Math.round((sec%3600)/60)` de l'autre — si bien qu'un reste de 59 min 30
 * s'arrondissait à 60 sans que l'heure ne s'incrémente.
 */
describe('splitDuration', () => {
  it('ne rend jamais 60 minutes', () => {
    expect(splitDuration(3 * 3600 + 59 * 60 + 30)).toEqual({ h: 4, m: 0 });
    expect(splitDuration(3599)).toEqual({ h: 1, m: 0 });
  });

  it('découpe une durée ordinaire', () => {
    expect(splitDuration(3 * 3600 + 25 * 60)).toEqual({ h: 3, m: 25 });
    expect(splitDuration(45 * 60)).toEqual({ h: 0, m: 45 });
    expect(splitDuration(0)).toEqual({ h: 0, m: 0 });
  });

  it('arrondit les secondes à la minute la plus proche', () => {
    expect(splitDuration(29)).toEqual({ h: 0, m: 0 });
    expect(splitDuration(31)).toEqual({ h: 0, m: 1 });
  });
});

/**
 * Régression : le hub Sport affichait « other » brut dans « 3 dernières
 * activités » alors que l'historique montrait le vrai nom. La règle vivait en
 * double dans l'historique et le détail ; le hub, lui, ne l'avait pas.
 */
describe('activityTitle', () => {
  it('traduit un type connu', () => {
    expect(activityTitle('running')).toBe('Course');
    expect(activityTitle('strength')).toBe('Musculation');
  });

  it('préfère les notes pour une activité « other », qui portent son vrai nom', () => {
    expect(activityTitle('other', 'Padel')).toBe('Padel');
  });

  it('retombe sur le libellé générique quand « other » n a pas de notes', () => {
    expect(activityTitle('other')).toBe('Autre');
    expect(activityTitle('other', '   ')).toBe('Autre');
  });

  it('ignore les notes d un type déjà nommé', () => {
    expect(activityTitle('running', 'Footing du soir')).toBe('Course');
  });

  it('rend le type tel quel s il est inconnu, plutôt que rien', () => {
    expect(activityTitle('padel')).toBe('padel');
  });
});
