import { useMemo } from 'react';
import type { MuscleGroup } from '@supotsu/core';
import { useMuscleSessions } from '@/lib/data/queries';
import { muscleStatesFor } from '@/features/muscles/muscleColor';
import { stretchesForMuscles, type Stretch } from './stretchCatalog';

/** Muscles worth stretching today: recently fatigued/worked, most-in-need first (same rule as the Sport hub's "Encore fatigués" tags). */
export function useTodayStretchMuscles(limit = 4): { muscles: MuscleGroup[]; loading: boolean } {
  const { data: sessions = [], isLoading } = useMuscleSessions();
  const asOf = useMemo(() => new Date().toISOString(), []);
  const muscles = useMemo(() => {
    const states = muscleStatesFor(sessions, asOf);
    return states
      .filter((s) => s.lastTrainedDaysAgo !== null && (s.state === 'fatigued' || s.state === 'worked'))
      .sort((a, b) => a.freshness - b.freshness)
      .slice(0, limit)
      .map((s) => s.muscle);
  }, [sessions, asOf, limit]);
  return { muscles, loading: isLoading };
}

export function useTodayStretchRoutine(): { stretches: Stretch[]; muscles: MuscleGroup[]; loading: boolean } {
  const { muscles, loading } = useTodayStretchMuscles();
  const stretches = useMemo(() => stretchesForMuscles(muscles, 2), [muscles]);
  return { stretches, muscles, loading };
}
