import { useState } from 'react';
import type { ISODateString } from '@supotsu/core';

/**
 * Le jour consulté par un hub.
 *
 * Un objet, pas une chaîne : `useSelectedDay` rendait `23:59:59.999` en heure
 * locale — un *instant* qui se faisait passer pour un *jour*. Chaque écran
 * redérivait le jour à sa façon, et cinq bugs en sont sortis : la récupération
 * musculaire calculée treize heures en avance, une habitude cochée le mauvais
 * jour, un repas absent de son écran, deux jours de sommeil affichant la même
 * nuit, des pas rangés la veille.
 *
 * Un objet ne peut pas être passé là où une chaîne est attendue, donc l'erreur
 * n'est plus écrivable — et les moteurs, qui prennent un `asOf: ISODateString`
 * à juste titre, n'ont pas bougé.
 *
 * Les trois instants sont nommés parce que les trois usages sont réels et
 * distincts. Il n'y a délibérément PAS de « maintenant » : un écran qui en a
 * besoin appelle `new Date()`. Le jour consulté ne doit jamais en tenir lieu.
 */
export interface SelectedDay {
  /** Jour civil local, AAAA-MM-JJ — regroupements, paramètres de route. */
  key: string;
  /** Minuit local — borne inférieure. */
  startOfDay: ISODateString;
  /** 23:59:59.999 local — borne supérieure d'un `asOf`. */
  endOfDay: ISODateString;
  /**
   * Midi local — instant stable pour horodater une écriture. Midi ne change
   * pas de jour sous une heure de dérive (heure d'été, fuseau réinterprété) ;
   * minuit et fin de journée, si. Même convention que le sommeil et les pas.
   */
  noon: ISODateString;
  isToday: boolean;
}

/** Jour civil LOCAL d'un instant. `iso.slice(0, 10)` donnerait le jour UTC. */
export function dayKeyOf(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le SelectedDay d'une clé AAAA-MM-JJ. */
export function selectedDayFrom(key: string): SelectedDay {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return {
    key,
    startOfDay: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    noon: new Date(y, m - 1, d, 12, 0, 0, 0).toISOString(),
    endOfDay: new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(),
    isToday: key === dayKeyOf(new Date()),
  };
}

export const selectedDayToday = (): SelectedDay => selectedDayFrom(dayKeyOf(new Date()));

/**
 * Décale de `days` jours **civils**. Ajouter 86 400 000 ms donnerait la
 * mauvaise heure — voire le mauvais jour — la nuit d'un changement d'heure ;
 * passer par les composantes locales laisse la plateforme s'en charger.
 */
export function shiftDay(day: SelectedDay, days: number): SelectedDay {
  const [y, m, d] = day.key.split('-').map(Number) as [number, number, number];
  return selectedDayFrom(dayKeyOf(new Date(y, m - 1, d + days, 12)));
}

/**
 * `selectedDay` d'un hub : démarre sur aujourd'hui à chaque montage de l'écran
 * — changer d'onglet et revenir revient à aujourd'hui plutôt que de retenir le
 * dernier jour consulté.
 */
export function useSelectedDay(): [SelectedDay, (day: SelectedDay) => void] {
  return useState<SelectedDay>(selectedDayToday);
}
