import type { DashboardCardPref } from '@/lib/preferences';

export interface DashboardCardDef {
  id: string;
  label: string;
}

/** Every customizable Dashboard card, in default order. The header, "Focus du
 * jour" banner and "Score Kaizen" are fixed — not customizable, they're the
 * screen's identity, not a widget. */
export const DASHBOARD_CARD_DEFS: DashboardCardDef[] = [
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

export const DEFAULT_DASHBOARD_CARDS: DashboardCardPref[] = DASHBOARD_CARD_DEFS.map((d) => ({
  id: d.id,
  visible: true,
}));

/**
 * Merge a saved preference with the current card set: keeps the saved
 * order/visibility, appends any card added since (e.g. a future update)
 * at the end as visible, and drops ids that no longer exist.
 */
export function resolveDashboardCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  if (!saved || saved.length === 0) return DEFAULT_DASHBOARD_CARDS;
  const validIds = new Set(DASHBOARD_CARD_DEFS.map((d) => d.id));
  const kept = saved.filter((s) => validIds.has(s.id));
  const keptIds = new Set(kept.map((k) => k.id));
  const missing = DASHBOARD_CARD_DEFS.filter((d) => !keptIds.has(d.id)).map((d) => ({ id: d.id, visible: true }));
  return [...kept, ...missing];
}
