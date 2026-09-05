/**
 * Rampe d'échauffement (Lot 1 — fondations création & suivi). Pur : une série
 * de travail en entrée, les marches d'échauffement en sortie. Le moteur ignore
 * le poids de la barre — c'est à l'appelant de filtrer les marches plus légères
 * que la barre à vide, il est le seul à connaître le matériel de l'utilisateur.
 */

export interface WarmupSet {
  weightKg: number;
  reps: number;
  percent: number;
}

export interface WarmupOptions {
  /** Pas d'arrondi des charges, en kg. */
  roundToKg?: number;
}

/** Pourcentages de la charge de travail, et reps associées — dégressives : on s'échauffe, on ne fatigue pas. */
const STEPS: { percent: number; repsFactor: number; maxReps: number }[] = [
  { percent: 40, repsFactor: 1, maxReps: 10 },
  { percent: 60, repsFactor: 0.6, maxReps: 6 },
  { percent: 80, repsFactor: 0.4, maxReps: 3 },
];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Rampe vers une série de travail : ~40/60/80 % de la charge, reps dégressives.
 * Vide si la charge de travail n'est pas exploitable (nulle, négative, non finie).
 */
export function warmupRamp(workKg: number, workReps: number, opts: WarmupOptions = {}): WarmupSet[] {
  if (!Number.isFinite(workKg) || workKg <= 0) return [];
  const step = opts.roundToKg && opts.roundToKg > 0 ? opts.roundToKg : 2.5;
  const baseReps = Number.isFinite(workReps) && workReps > 0 ? workReps : 1;

  return STEPS.map(({ percent, repsFactor, maxReps }) => ({
    // Jamais zéro : une marche à 0 kg n'est pas un échauffement, on garde le
    // plus petit incrément représentable à la place.
    weightKg: Math.max(step, roundTo((workKg * percent) / 100, step)),
    reps: Math.max(1, Math.min(maxReps, Math.round(baseReps * repsFactor))),
    percent,
  }));
}
