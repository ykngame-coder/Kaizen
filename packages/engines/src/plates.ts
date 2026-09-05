/**
 * Calculateur de disques (Lot 1 — fondations création & suivi). Pur : une
 * charge cible, un poids de barre et les disques disponibles en entrée, la
 * pile d'un côté en sortie. Ne connaît ni l'UI ni les préférences.
 */

export interface PlateCount {
  plateKg: number;
  count: number;
}

export interface PlateSolution {
  /** Disques d'un seul côté de la barre, du plus lourd au plus léger. */
  perSide: PlateCount[];
  /** Charge réellement atteinte — inférieure à la cible si les disques ne tombent pas juste. */
  achievedKg: number;
}

/** Tolérance de comparaison : les disques vont au quart de kilo, les flottants dérivent. */
const EPSILON = 1e-9;

/**
 * Décomposition gloutonne : à chaque étape le disque le plus lourd qui tient
 * encore dans ce qu'il reste à charger. Optimal ici parce que les jeux de
 * disques réels sont "canoniques" (chaque disque est un multiple des plus
 * petits), et de toute façon c'est ainsi qu'on charge une barre en salle.
 * Retourne undefined si la cible est sous le poids de la barre.
 */
export function computePlates(
  targetKg: number,
  barKg: number,
  available: number[],
): PlateSolution | undefined {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) return undefined;
  if (targetKg < barKg - EPSILON) return undefined;

  // Une barre se charge symétriquement : on raisonne sur un seul côté.
  let remainingPerSide = (targetKg - barKg) / 2;
  const usable = [...new Set(available.filter((p) => Number.isFinite(p) && p > 0))].sort((a, b) => b - a);

  const perSide: PlateCount[] = [];
  for (const plateKg of usable) {
    const count = Math.floor((remainingPerSide + EPSILON) / plateKg);
    if (count <= 0) continue;
    perSide.push({ plateKg, count });
    remainingPerSide -= count * plateKg;
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p.plateKg * p.count, 0);
  return { perSide, achievedKg: barKg + loadedPerSide * 2 };
}
