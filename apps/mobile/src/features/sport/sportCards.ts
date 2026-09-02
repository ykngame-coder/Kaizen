import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Sport card, in default order. The header, day
 * navigation and the séance/score/corps/muscles carousel are fixed — the
 * screen's identity, not a widget.
 */
export const SPORT_CARD_DEFS: HubCardDef[] = [
  { id: 'recent', label: '3 dernières activités' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'sections', label: 'Sections' },
  { id: 'comprendre', label: 'Comprendre' },
  { id: 'objectifs', label: 'Objectifs' },
];

export function resolveSportCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(SPORT_CARD_DEFS, saved);
}
