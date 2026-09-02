import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Sommeil card, in default order. The header, day
 * navigation, and the main sleep-score summary (ring + stress/bien-être row)
 * are fixed — the screen's identity, not a widget.
 */
export const SOMMEIL_CARD_DEFS: HubCardDef[] = [
  { id: 'last7Nights', label: '7 dernières nuits' },
  { id: 'phases', label: 'Phases de sommeil' },
  { id: 'bedtime', label: 'Coucher optimal' },
  { id: 'advice', label: 'Conseil du jour' },
  { id: 'detail', label: 'Détail du score' },
  { id: 'debtTrend', label: 'Évolution de la dette' },
  { id: 'prediction', label: 'Prévision de demain' },
  { id: 'signals', label: 'Signaux' },
  { id: 'circadian', label: 'Rythme circadien' },
  { id: 'tools', label: 'Outils de récupération' },
  { id: 'comprendre', label: 'Comprendre' },
  { id: 'objectifs', label: 'Objectifs' },
];

export function resolveSommeilCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(SOMMEIL_CARD_DEFS, saved);
}
