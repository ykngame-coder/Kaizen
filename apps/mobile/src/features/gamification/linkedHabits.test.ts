import { describe, expect, it } from 'vitest';
import { linkedKindFor, showsTargetPicker } from './linkedHabits';

describe('showsTargetPicker', () => {
  it('propose la cible d une habitude ordinaire', () => {
    expect(showsTargetPicker(null, 'daily')).toBe(true);
    expect(showsTargetPicker(null, 'weekly')).toBe(true);
  });

  it('laisse régler le nombre de séances par semaine', () => {
    // Rien d'autre dans l'app ne dit « trois fois par semaine » : sans ce
    // réglage, une habitude hebdomadaire de sport restait bloquée à sa valeur
    // de création.
    expect(showsTargetPicker('workout', 'weekly')).toBe(true);
    expect(showsTargetPicker('workout', 'daily')).toBe(true);
  });

  it('laisse régler la fréquence des pesées', () => {
    expect(showsTargetPicker('weight', 'weekly')).toBe(true);
  });

  it('se tait sur le seuil quotidien réglé ailleurs', () => {
    // Boire 2,5 L ou marcher 10 000 pas : la valeur se règle dans Nutrition
    // ou les Réglages, et la cible ne peut être qu'« une fois par jour ».
    expect(showsTargetPicker('hydration', 'daily')).toBe(false);
    expect(showsTargetPicker('steps', 'daily')).toBe(false);
  });

  it('mais propose la cible quand ces mêmes habitudes passent à la semaine', () => {
    // « Atteindre mon objectif d'eau cinq jours par semaine » est un objectif
    // qui se règle, lui.
    expect(showsTargetPicker('hydration', 'weekly')).toBe(true);
    expect(showsTargetPicker('steps', 'weekly')).toBe(true);
  });
});

describe('linkedKindFor', () => {
  it('reconnaît les habitudes suivies automatiquement', () => {
    expect(linkedKindFor("Boire de l'eau")).toBe('hydration');
    expect(linkedKindFor('Séance de sport')).toBe('workout');
    expect(linkedKindFor('Pesée du matin')).toBe('weight');
    expect(linkedKindFor('10 000 pas')).toBe('steps');
    expect(linkedKindFor('Lecture')).toBeNull();
  });
});
