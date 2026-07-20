import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityInput } from '@supotsu/shared';
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
