import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Dashboard card, in default order. The header, "Focus du
 * jour" banner and "Score Kaizen" are fixed — not customizable, they're the
 * screen's identity, not a widget.
 */
export const DASHBOARD_CARD_DEFS: HubCardDef[] = [
  { id: 'etat-du-jour', label: 'État du jour' },
  { id: 'kpis', label: 'Indicateurs clés' },
  { id: 'priorites', label: 'Priorités du jour' },
  { id: 'prochaine-seance', label: 'Prochaine séance' },
  { id: 'corps-recuperation', label: 'Corps & récupération' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'habitudes', label: 'Habitudes' },
  { id: 'tendances', label: 'Tendances' },
  { id: 'analyse', label: 'Analyse du jour' },
  { id: 'badges', label: 'Badges récents' },
  { id: 'acces-rapides', label: 'Accès rapides' },
];

/** Thin wrapper around the shared resolveCardOrder — keeps DashboardScreen's existing call site unchanged. */
export function resolveDashboardCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(DASHBOARD_CARD_DEFS, saved);
}
