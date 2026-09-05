import { useEffect, useMemo, useRef, useState } from 'react';
import { elapsedSecFrom, type RunClock } from './runnerState';

export interface RunClockApi {
  elapsedSec: number;
  isPaused: boolean;
  togglePause: () => void;
  /** Repart de zéro — au changement de bloc. */
  reset: () => void;
}

/**
 * Horloge partagée des blocs chronométrés (Lot 2b). L'intervalle ne fait que
 * rafraîchir l'affichage : la valeur vient toujours d'`elapsedSecFrom`, donc
 * un passage en arrière-plan ne fait pas dériver le chrono.
 */
export function useRunClock(runningKey: string | undefined): RunClockApi {
  const clockRef = useRef<RunClock>({ startedAtMs: Date.now(), pausedTotalMs: 0 });
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Nouveau bloc : nouvelle horloge.
  useEffect(() => {
    clockRef.current = { startedAtMs: Date.now(), pausedTotalMs: 0 };
    setNowMs(Date.now());
  }, [runningKey]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = elapsedSecFrom(clockRef.current, nowMs);
  const isPaused = clockRef.current.pausedAtMs !== undefined;

  return useMemo(
    () => ({
      elapsedSec,
      isPaused,
      togglePause: () => {
        const c = clockRef.current;
        clockRef.current =
          c.pausedAtMs === undefined
            ? { ...c, pausedAtMs: Date.now() }
            // Reprise : le temps passé en pause s'ajoute au cumul, l'origine ne bouge pas.
            : { startedAtMs: c.startedAtMs, pausedTotalMs: c.pausedTotalMs + (Date.now() - c.pausedAtMs) };
        setNowMs(Date.now());
      },
      reset: () => {
        clockRef.current = { startedAtMs: Date.now(), pausedTotalMs: 0 };
        setNowMs(Date.now());
      },
    }),
    [elapsedSec, isPaused],
  );
}
