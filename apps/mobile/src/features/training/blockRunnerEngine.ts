export interface BlockRunnerState {
  /** Seconds to display — counts down for amrap/emom, up for for_time. */
  displaySec: number;
  /** 1-based current round/interval number. */
  currentRound: number;
  /** True once the block's timing condition is satisfied. */
  isFinished: boolean;
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

/** "m:ss" — matches IntervalTimerScreen's plain-seconds display, just with a minutes component for longer AMRAP/for-time durations. */
export function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
