import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityInput,
  AthleteProfileInput,
  ChallengeInput,
  GoalInput,
  HabitInput,
  NutritionEntryInput,
  ProgramSessionSlotInput,
  UserProgramInput,
  UserSessionInput,
  WellnessCheckinInput,
} from '@supotsu/shared';
import type { Challenge, Visibility, Workout } from '@supotsu/core';
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
} from '@supotsu/connectors';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, type NewWorkout, type PlannedInput } from './repository';

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

export function useSleepSessions() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['sleepSessions', user?.id],
    enabled: !!user,
    queryFn: () => repo.listSleepSessions(user!.id),
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

export function useChallenges() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['challenges', user?.id],
    enabled: !!user,
    queryFn: () => repo.listChallenges(),
  });
}

export function useMyChallengeIds() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['myChallenges', user?.id],
    enabled: !!user,
    queryFn: () => repo.listMyChallengeIds(user!.id),
  });
}

export function useCreateChallenge() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChallengeInput) => repo.createChallenge(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges', user?.id] });
      qc.invalidateQueries({ queryKey: ['myChallenges', user?.id] });
    },
  });
}

export function useJoinChallenge() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) => repo.joinChallenge(user!.id, challengeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myChallenges', user?.id] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}

export function useChallengeLeaderboard(challenge: Challenge | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['leaderboard', challenge?.id],
    enabled: !!user && !!challenge,
    queryFn: () => repo.challengeLeaderboard(challenge!),
  });
}

export function usePrograms() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['programs', user?.id],
    enabled: !!user,
    queryFn: () => repo.listPrograms(),
  });
}

export function useEnrolledProgramIds() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['enrollments', user?.id],
    enabled: !!user,
    queryFn: () => repo.listEnrolledProgramIds(user!.id),
  });
}

export function useEnrollProgram() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => repo.enrollProgram(user!.id, programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', user?.id] });
    },
  });
}

// --- user-created séances & programmes -------------------------------------
export function useUserSessions() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['userSessions', user?.id],
    enabled: !!user,
    queryFn: () => repo.listUserSessions(user!.id),
  });
}

export function useCommunitySessions() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['communitySessions', user?.id],
    enabled: !!user,
    queryFn: () => repo.listCommunitySessions(user!.id),
  });
}

export function useSessionExercises(sessionId: string | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['sessionExercises', sessionId],
    enabled: !!sessionId,
    queryFn: () => repo.getSessionExercises(sessionId!),
  });
}

export function useAddUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserSessionInput) => repo.addUserSession(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
    },
  });
}

export function useSetSessionVisibility() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, visibility }: { sessionId: string; visibility: Visibility }) =>
      repo.setSessionVisibility(user!.id, sessionId, visibility),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['communitySessions'] });
    },
  });
}

export function useDeleteUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => repo.deleteUserSession(user!.id, sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['programSessions'] });
    },
  });
}

export function useCopySession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceSessionId: string) => repo.copySession(user!.id, sourceSessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
    },
  });
}

export function useUserPrograms() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['userPrograms', user?.id],
    enabled: !!user,
    queryFn: () => repo.listUserPrograms(user!.id),
  });
}

export function useCommunityPrograms() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['communityPrograms', user?.id],
    enabled: !!user,
    queryFn: () => repo.listCommunityPrograms(user!.id),
  });
}

export function useProgramSessions(programId: string | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['programSessions', programId],
    enabled: !!programId,
    queryFn: () => repo.getProgramSessions(programId!),
  });
}

export function useAddUserProgram() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserProgramInput) => repo.addUserProgram(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPrograms', user?.id] });
    },
  });
}

export function useSetProgramVisibility() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, visibility }: { programId: string; visibility: Visibility }) =>
      repo.setProgramVisibility(user!.id, programId, visibility),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPrograms', user?.id] });
      qc.invalidateQueries({ queryKey: ['communityPrograms'] });
    },
  });
}

export function useDeleteUserProgram() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => repo.deleteUserProgram(user!.id, programId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPrograms', user?.id] });
    },
  });
}

export function useAssignProgramSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, slot }: { programId: string; slot: ProgramSessionSlotInput }) =>
      repo.assignProgramSession(user!.id, programId, slot),
    onSuccess: (_data, { programId }) => {
      qc.invalidateQueries({ queryKey: ['programSessions', programId] });
    },
  });
}

export function useRemoveProgramSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programSessionId }: { programSessionId: string; programId: string }) =>
      repo.removeProgramSession(user!.id, programSessionId),
    onSuccess: (_data, { programId }) => {
      qc.invalidateQueries({ queryKey: ['programSessions', programId] });
    },
  });
}

export function useCopyProgram() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceProgramId: string) => repo.copyProgram(user!.id, sourceProgramId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPrograms', user?.id] });
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
    },
  });
}

export function useImportHealth() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      activities: ImportedActivity[];
      healthMetrics: ImportedHealthMetric[];
      records: ImportedRecord[];
      sleepSessions: ImportedSleepSession[];
    }) => repo.persistImport(user!.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      qc.invalidateQueries({ queryKey: ['health', user?.id] });
      qc.invalidateQueries({ queryKey: ['records', user?.id] });
      qc.invalidateQueries({ queryKey: ['sleepSessions', user?.id] });
    },
  });
}

export function useRecords() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['records', user?.id],
    enabled: !!user,
    queryFn: () => repo.listRecords(user!.id),
  });
}

export function useMuscleSessions() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['muscleSessions', user?.id],
    enabled: !!user,
    queryFn: () => repo.listMuscleSessions(user!.id),
  });
}

export function useMuscleWork() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['muscleWork', user?.id],
    enabled: !!user,
    queryFn: () => repo.listMuscleWork(user!.id),
  });
}

export function useAthleteProfile() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['athleteProfile', user?.id],
    enabled: !!user,
    queryFn: () => repo.getAthleteProfile(user!.id),
  });
}

export function useSaveAthleteProfile() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AthleteProfileInput) => repo.saveAthleteProfile(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athleteProfile', user?.id] });
    },
  });
}

export function useGoals() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['goals', user?.id],
    enabled: !!user,
    queryFn: () => repo.listGoals(user!.id),
  });
}

export function useAddGoal() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => repo.addGoal(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals', user?.id] });
    },
  });
}

export function useUpdateGoalCurrent() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, currentValue }: { goalId: string; currentValue: number }) =>
      repo.updateGoalCurrent(user!.id, goalId, currentValue),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals', user?.id] });
    },
  });
}

export function useWellnessCheckins() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['wellness', user?.id],
    enabled: !!user,
    queryFn: () => repo.listWellnessCheckins(user!.id),
  });
}

export function useAddWellnessCheckin() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WellnessCheckinInput) => repo.addWellnessCheckin(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness', user?.id] });
    },
  });
}

export function useExerciseHistory() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['exerciseHistory', user?.id],
    enabled: !!user,
    queryFn: () => repo.lastSessionSetsByExercise(user!.id),
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
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}

export function usePlannedWorkouts() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['plannedWorkouts', user?.id],
    enabled: !!user,
    queryFn: () => repo.listPlannedWorkouts(user!.id),
  });
}

export function useAddPlannedWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlannedInput) => repo.addPlannedWorkout(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
    },
  });
}

export function useSetWorkoutStatus() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workoutId: string;
      status: Workout['status'];
      completedAt?: string | null;
    }) => repo.setWorkoutStatus(user!.id, input.workoutId, input.status, input.completedAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
    },
  });
}

export function useDeletePlannedWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workoutId: string) => repo.deletePlannedWorkout(user!.id, workoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
    },
  });
}
