import type { DashboardCardPref } from './preferences';

export interface HubCardDef {
  id: string;
  label: string;
}

/**
 * Merge a saved card preference with a hub's current card set: keeps the
 * saved order/visibility, appends any card added since (e.g. a future
 * update) at the end as visible, and drops ids that no longer exist.
 * Shared by every hub's customize screen and main screen — see
 * dashboardCards.ts, sportCards.ts, nutritionCards.ts, sommeilCards.ts for
 * the per-hub defs that feed this.
 */
export function resolveCardOrder(defs: HubCardDef[], saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  if (!saved || saved.length === 0) return defs.map((d) => ({ id: d.id, visible: true }));
  const validIds = new Set(defs.map((d) => d.id));
  const kept = saved.filter((s) => validIds.has(s.id));
  const keptIds = new Set(kept.map((k) => k.id));
  const missing = defs.filter((d) => !keptIds.has(d.id)).map((d) => ({ id: d.id, visible: true }));
  return [...kept, ...missing];
}
