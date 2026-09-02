import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Nutrition card, in default order. The header, day
 * navigation and the main kcal ring card are fixed — the screen's identity,
 * not a widget.
 */
export const NUTRITION_CARD_DEFS: HubCardDef[] = [
  { id: 'macros', label: 'Macros' },
  { id: 'hydration', label: 'Hydratation' },
  { id: 'meals', label: 'Repas' },
  { id: 'score', label: 'Score Nutrition' },
  { id: 'weight', label: 'Poids & composition' },
  { id: 'impact', label: 'Impact' },
  { id: 'trend', label: 'Tendances' },
  { id: 'goals', label: 'Objectifs nutritionnels' },
  { id: 'micronutrients', label: 'Micronutriments' },
  { id: 'comprendre', label: 'Comprendre' },
];

export function resolveNutritionCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(NUTRITION_CARD_DEFS, saved);
}
