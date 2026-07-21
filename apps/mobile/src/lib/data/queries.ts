import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityInput, HabitInput, NutritionEntryInput } from '@supotsu/shared';
import { getConnector, importFromConnector, type ConnectorProvider } from '@supotsu/connectors';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, type NewWorkout } from './repository';

/** Single repository instance for the app session. */
function useRepository() {
  return useMemo(() => createDataRepository(), []);
}

export function useActivities() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['activities', user?.id],
    enabled: !!user,
    queryFn: () => repo.listActivities(user!.id),
  });
}

export function useAddActivity() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityInput) => repo.addActivity(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
    },
  });
}

export function useHealthMetrics() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['health', user?.id],
    enabled: !!user,
    queryFn: () => repo.listHealthMetrics(user!.id),
  });
}

/** Run a connector through the import pipeline and persist the result. */
export function useSyncConnector() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: ConnectorProvider) => {
      const connector = getConnector(provider);
      if (!connector) throw new Error('Ce connecteur n’est pas encore disponible.');
      const existing = await repo.listActivities(user!.id);
      const outcome = await importFromConnector(
        connector,
        existing.map((a) => ({ type: a.type, startedAt: a.startedAt, durationSec: a.durationSec })),
        new Date().toISOString(),
      );
      return repo.persistImport(user!.id, {
        activities: outcome.activities,
        healthMetrics: outcome.healthMetrics,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      qc.invalidateQueries({ queryKey: ['health', user?.id] });
    },
  });
}

export function useNutritionEntries() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['nutrition', user?.id],
    enabled: !!user,
    queryFn: () => repo.listNutritionEntries(user!.id),
  });
}

export function useAddNutritionEntry() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NutritionEntryInput) => repo.addNutritionEntry(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', user?.id] });
    },
  });
}

export function useHabits() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['habits', user?.id],
    enabled: !!user,
    queryFn: () => repo.listHabits(user!.id),
  });
}

export function useAddHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HabitInput) => repo.addHabit(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits', user?.id] });
    },
  });
}

export function useHabitLogs() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['habitLogs', user?.id],
    enabled: !!user,
    queryFn: () => repo.listHabitLogs(user!.id),
  });
}

export function useLogHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: string) => repo.logHabit(user!.id, habitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habitLogs', user?.id] });
    },
  });
}

export function useWorkouts() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['workouts', user?.id],
    enabled: !!user,
    queryFn: () => repo.listWorkouts(user!.id),
  });
}

export function useAddWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workout: NewWorkout) => repo.addWorkout(user!.id, workout),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
    },
  });
}
