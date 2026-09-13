import type { MealType, NutritionEntry } from '@supotsu/core';
import type { NutritionEntryInput } from '@supotsu/shared';
import { dayKeyOf } from '@/features/navigation/day';

/**
 * Où envoie une copie ou un déplacement : un repas précis, ou « le repas
 * d'origine » — chaque aliment garde le sien. Sans cette option, copier une
 * journée entière sur le lendemain rangerait tout dans un seul repas.
 */
export type MealTarget = MealType | 'origin';

export function resolveMeal(entry: Pick<NutritionEntry, 'mealType'>, target: MealTarget): MealType {
  return target === 'origin' ? entry.mealType : target;
}

/**
 * Même heure LOCALE, posée sur un autre jour civil.
 *
 * Garder l'heure conserve l'ordre du repas copié. Décaler de N × 86 400 000 ms
 * tomberait une heure à côté la nuit d'un changement d'heure ; passer par les
 * composantes locales laisse la plateforme s'en charger. Une heure qui
 * n'existe pas ce jour-là (02:30 au passage à l'heure d'été) glisse à 03:30,
 * mais reste sur le bon jour — c'est le jour qui compte.
 */
export function retimeToDay(loggedAt: string, dayKey: string): string {
  const src = new Date(loggedAt);
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds()).toISOString();
}

/**
 * L'entrée à insérer pour copier `entry`.
 *
 * Reprend TOUT ce qui décrit l'aliment — la copie précédente oubliait
 * `quantityG`, si bien qu'un aliment saisi pour 100 g se rouvrait en mode
 * Total une fois copié. La source devient `manual` : une copie est un geste de
 * l'utilisateur, pas une donnée arrivée d'un capteur, et la marquer
 * `apple_health` la ferait passer pour un doublon à la prochaine synchro.
 */
export function copyInputOf(entry: NutritionEntry, dayKey: string, target: MealTarget): NutritionEntryInput {
  return {
    mealType: resolveMeal(entry, target),
    description: entry.description,
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbG: entry.carbG,
    fatG: entry.fatG,
    hydrationMl: entry.hydrationMl,
    quantityG: entry.quantityG,
    source: 'manual',
    loggedAt: retimeToDay(entry.loggedAt, dayKey),
  };
}

export interface MovePatch {
  entryId: string;
  mealType?: MealType;
  loggedAt?: string;
}

/**
 * Le correctif pour déplacer `entry`, limité à ce qui change — ou `null` s'il
 * est déjà à destination. Un aliment « déjà au dîner » dans une sélection
 * qu'on envoie au dîner ne doit pas coûter une écriture.
 */
export function movePatchOf(entry: NutritionEntry, dayKey: string, target: MealTarget): MovePatch | null {
  const mealType = resolveMeal(entry, target);
  const patch: MovePatch = { entryId: entry.id };
  if (mealType !== entry.mealType) patch.mealType = mealType;
  if (dayKeyOf(entry.loggedAt) !== dayKey) patch.loggedAt = retimeToDay(entry.loggedAt, dayKey);
  return patch.mealType !== undefined || patch.loggedAt !== undefined ? patch : null;
}

const keyToUtc = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/**
 * Écart en jours civils entre deux clés. Calculé sur des dates UTC construites
 * depuis les composantes : aucune heure d'été ne peut s'y glisser.
 */
export function dayOffset(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86_400_000);
}

/**
 * Les jours de la roue : de `back` jours avant aujourd'hui à `forward` après,
 * élargis pour contenir le jour d'ancrage à ± 7 jours. Sans cet
 * élargissement, ouvrir la feuille depuis un jour vieux de trois mois
 * présenterait une roue qui ne contient pas le jour qu'on regarde.
 */
export function wheelDayKeys(todayKey: string, anchorKey: string, back = 60, forward = 7): string[] {
  const startOffset = Math.min(-back, dayOffset(todayKey, anchorKey) - 7);
  const endOffset = Math.max(forward, dayOffset(todayKey, anchorKey) + 7);
  const [y, m, d] = todayKey.split('-').map(Number) as [number, number, number];
  const keys: string[] = [];
  for (let i = startOffset; i <= endOffset; i += 1) keys.push(dayKeyOf(new Date(y, m - 1, d + i, 12)));
  return keys;
}

/** État d'une case de repas : rien, une partie (le tiret), ou tout coché. */
export function mealSelectionState(entryIds: readonly string[], selected: ReadonlySet<string>): 'none' | 'some' | 'all' {
  const n = entryIds.filter((id) => selected.has(id)).length;
  if (n === 0) return 'none';
  return n === entryIds.length ? 'all' : 'some';
}

/**
 * Toucher la case d'un repas : tout cocher, sauf si tout l'est déjà — alors
 * tout décocher. Un repas coché en partie se complète, comme sur iOS.
 */
export function toggleMealSelection(entryIds: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (mealSelectionState(entryIds, selected) === 'all') entryIds.forEach((id) => next.delete(id));
  else entryIds.forEach((id) => next.add(id));
  return next;
}
