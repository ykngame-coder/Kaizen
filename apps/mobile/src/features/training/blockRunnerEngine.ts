export interface BlockRunnerState {
  /** Seconds to display — counts down for amrap/emom/tabata, up for for_time. */
  displaySec: number;
  /** 1-based current round/interval number. */
  currentRound: number;
  /** True once the block's timing condition is satisfied. */
  isFinished: boolean;
  /** Tabata only: which half of the round is running. */
  phase?: 'work' | 'rest';
}

/**
 * Tabata's total, ending on the last work phase — there is no rest after it.
 * A 20/10 × 8 therefore lasts 3:50, not the 4:00 the protocol is usually quoted
 * at. That is the convention IntervalTimerScreen already ships (it stops once
 * the final work phase ends), and two Tabatas of different lengths in one app
 * would be worse than either choice.
 */
export function tabataTotalSec(workSec: number, restSec: number, targetRounds: number): number {
  return targetRounds * workSec + Math.max(0, targetRounds - 1) * restSec;
}

/**
 * AMRAP: counts down from the time cap. `roundsCompleted` is caller-owned
 * state (incremented by the "Round terminé" button) — this only reports the
 * countdown, the current round number, and whether the cap has been hit.
 */
export function computeAmrapState(elapsedSec: number, timeCapSec: number, roundsCompleted: number): BlockRunnerState {
  const remaining = Math.max(0, timeCapSec - elapsedSec);
  return { displaySec: remaining, currentRound: roundsCompleted + 1, isFinished: remaining <= 0 };
}

/**
 * EMOM: one round per fixed interval, advancing automatically as elapsed
 * time crosses each interval boundary — no caller-owned round state needed.
 */
export function computeEmomState(elapsedSec: number, intervalSec: number, targetRounds: number): BlockRunnerState {
  const totalSec = targetRounds * intervalSec;
  const isFinished = elapsedSec >= totalSec;
  const round = Math.min(targetRounds, Math.floor(elapsedSec / intervalSec) + 1);
  const intoInterval = elapsedSec - (round - 1) * intervalSec;
  const remaining = isFinished ? 0 : Math.max(0, intervalSec - intoInterval);
  return { displaySec: remaining, currentRound: round, isFinished };
}

/**
 * Tabata: work and rest alternate on a fixed schedule, so the whole state is
 * derived from elapsed time — no caller-owned round state, same as EMOM.
 *
 * A round is one work phase plus the rest that follows it, except the last,
 * which has no rest (see `tabataTotalSec`).
 */
export function computeTabataState(
  elapsedSec: number,
  workSec: number,
  restSec: number,
  targetRounds: number,
): BlockRunnerState {
  const total = tabataTotalSec(workSec, restSec, targetRounds);
  if (elapsedSec >= total) {
    return { displaySec: 0, currentRound: targetRounds, phase: 'work', isFinished: true };
  }
  const cycle = workSec + restSec;
  // `cycle` is 0 only if both are 0, which the editor rejects; guard anyway so
  // a corrupt block cannot divide by zero.
  const round = cycle > 0 ? Math.min(targetRounds, Math.floor(elapsedSec / cycle) + 1) : 1;
  const intoRound = cycle > 0 ? elapsedSec - (round - 1) * cycle : 0;
  const inWork = intoRound < workSec;
  return {
    displaySec: inWork ? workSec - intoRound : cycle - intoRound,
    currentRound: round,
    phase: inWork ? 'work' : 'rest',
    isFinished: false,
  };
}

/**
 * Pour le temps: stopwatch counts up. `roundsCompleted` is caller-owned
 * state (the "Round terminé" button) — finishes once every round is done.
 */
export function computeForTimeState(elapsedSec: number, roundsCompleted: number, targetRounds: number): BlockRunnerState {
  return {
    displaySec: elapsedSec,
    currentRound: Math.min(targetRounds, roundsCompleted + 1),
    isFinished: roundsCompleted >= targetRounds,
  };
}

/** One Hyrox station's live timing state — distinct from `BlockRunnerState`, which is per-block. */
export interface HyroxStationState {
  /** Counts up for a distance-target station, down for a time-target one. */
  displaySec: number;
  /** True once a time-target station's countdown hits zero — the log phase should start automatically. Always false for a distance-target station, which the runner ends manually. */
  isFinished: boolean;
}

/**
 * Hyrox: a station's target is whichever of `distanceM`/`durationSec` is set
 * at creation — never both. The other one is what the runner logs once the
 * station is done, so this function only ever reads the target field.
 *
 * Distance-target: chronomètre, personne ne sait à l'avance combien de temps
 * ça prendra, donc pas de fin automatique. Time-target: décompte classique,
 * fin automatique à zéro comme n'importe quel minuteur de travail.
 */
export function computeHyroxStationState(elapsedSec: number, station: { distanceM?: number; durationSec?: number }): HyroxStationState {
  if (station.durationSec != null) {
    const remaining = Math.max(0, station.durationSec - elapsedSec);
    return { displaySec: remaining, isFinished: remaining <= 0 };
  }
  return { displaySec: elapsedSec, isFinished: false };
}

/** "m:ss" — matches IntervalTimerScreen's plain-seconds display, just with a minutes component for longer AMRAP/for-time durations. */
export function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The *other* exercise ids sharing `sets[index]`'s superset group, in order, deduplicated. Empty if that set isn't grouped. */
export function supersetPartners<T extends { exerciseId: string; supersetGroup?: number }>(sets: T[], index: number): string[] {
  const group = sets[index]?.supersetGroup;
  if (group == null) return [];
  const selfId = sets[index]!.exerciseId;
  const ids = new Set<string>();
  for (const s of sets) {
    if (s.supersetGroup === group && s.exerciseId !== selfId) ids.add(s.exerciseId);
  }
  return [...ids];
}
