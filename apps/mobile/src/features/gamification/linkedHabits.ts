export type LinkedKind = 'hydration' | 'steps' | 'workout' | 'weight';

/**
 * Habits whose real progress is already tracked elsewhere in the app,
 * detected from the name — HabitsScreen reads live data for these instead of
 * a manual tap, and auto-logs once the real target is hit. Shared between
 * HabitsScreen (detection at display time) and AddHabitScreen (live preview
 * while naming a habit), so the two never drift apart.
 */
export function linkedKindFor(name: string): LinkedKind | null {
  const n = name.toLowerCase();
  if (n.includes('eau') || n.includes('hydrat')) return 'hydration';
  // Testé avant 'steps' : la détection des pas cherche 'pas', qu'on retrouve
  // dans d'autres mots — mieux vaut que la pesée soit reconnue d'abord.
  if (n.includes('pesée') || n.includes('pesee') || n.includes('peser') || n.includes('poids')) return 'weight';
  if (n.includes('marche') || n.includes('pas')) return 'steps';
  if (n.includes('sport') || n.includes('séance') || n.includes('seance') || n.includes('entra') || n.includes('muscu')) return 'workout';
  return null;
}

/**
 * Claims the one auto-log allowed for `habitId` on `dayKey`, returning false if
 * it was already claimed. The decision has to be synchronous: the server
 * round-trip that would otherwise reveal "already logged" leaves a window in
 * which the auto-log effect reruns — and it reruns on every render, including
 * the one `mutate` itself causes — so without this claim the effect fed itself
 * a burst of duplicate inserts.
 */
export function claimAutoLog(attempted: Set<string>, habitId: string, dayKey: string): boolean {
  const key = `${habitId}:${dayKey}`;
  if (attempted.has(key)) return false;
  attempted.add(key);
  return true;
}

export const LINKED_LABEL: Record<LinkedKind, string> = {
  hydration: 'ton hydratation (Nutrition)',
  steps: 'tes pas (Apple Santé / Garmin)',
  workout: 'tes séances (Sport, y compris import Apple Santé/Garmin)',
  weight: 'tes pesées (Nutrition / Apple Santé)',
};

/**
 * Faut-il proposer de régler la cible d'une habitude ?
 *
 * Une habitude à suivi automatique cachait toujours sa cible, au motif que
 * « la vraie valeur vit ailleurs ». C'est vrai du seuil quotidien (2,5 L
 * d'eau, 10 000 pas, réglés dans Nutrition ou les Réglages), pas du NOMBRE de
 * fois : « 3 séances par semaine » n'est défini nulle part ailleurs, et c'est
 * lui qui décide quand l'habitude est due et quand elle est tenue.
 */
export function showsTargetPicker(linked: LinkedKind | null, cadence: 'daily' | 'weekly'): boolean {
  if (!linked) return true;
  // Seuil quotidien réglé ailleurs : la cible ne peut être que « une fois ».
  const hasExternalDailyGoal = linked === 'hydration' || linked === 'steps';
  return !(hasExternalDailyGoal && cadence === 'daily');
}
