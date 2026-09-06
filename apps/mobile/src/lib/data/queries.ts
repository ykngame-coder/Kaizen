import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityInput,
  AthleteProfileInput,
  ChallengeInput,
  CustomExerciseInput,
  GoalInput,
  HabitInput,
  NutritionEntryInput,
  ProgramSessionSlotInput,
  UserProgramInput,
  UserSessionInput,
  WellnessCheckinInput,
} from '@supotsu/shared';
import type { Challenge, GoalType, MealType, MuscleGroup, SetEntry, Visibility, Workout } from '@supotsu/core';
import { dedupActivities, estimateActivityHeartRateWindow, estimateWorkoutHeartRateWindow } from '@supotsu/connectors';
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
  ImportedWorkout,
} from '@supotsu/connectors';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, type HealthMetricInput, type NewCircuitBlockInput, type NewCircuitWorkout, type NewRunnerSet, type NewSleepSession, type NewWorkout, type PlannedInput, type SetLogInput } from './repository';
import { isHealthKitConnected } from '@/features/connectors/useHealthKitAutoSync';
import { queryHeartRateSummary, saveActivityToHealthKit, saveNutritionToHealthKit, saveWorkoutToHealthKit } from '@/features/connectors/healthKitClient';
import { periodToDays, type DailyScoreColumn, type LeaderboardCategory, type LeaderboardPeriod } from '@/features/community/leaderboardHelpers';

/**
 * Mirrors a manually-logged activity/meal/water/workout into Apple Health,
 * once HealthKit is connected — same "automatic, no extra toggle" behaviour
 * as reading. Never throws: writing to HealthKit must not break the actual
 * in-app log action it's attached to.
 */
async function mirrorToHealthKit(write: () => Promise<void>): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if (!(await isHealthKitConnected())) return;
    await write();
  } catch {
    // Best-effort.
  }
}

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
    onSuccess: (data, input) => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      void mirrorToHealthKit(() => saveActivityToHealthKit(input));
      // Only chase heart rate when the entry doesn't already carry one
      // (never overwrite a manual value the user just typed in).
      if (input.avgHeartRate == null) {
        void mirrorToHealthKit(async () => {
          const window = estimateActivityHeartRateWindow(input.startedAt, input.durationSec);
          const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
          if (summary) await repo.setActivityHeartRate(user!.id, data.id, summary);
        });
      }
    },
  });
}

/** Set (or clear) an activity's self-reported worked muscles. */
export function useUpdateActivityMuscles() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; muscles: MuscleGroup[] }) => repo.updateActivityMuscles(user!.id, input.activityId, input.muscles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
    },
  });
}

/** Remove a logged/imported activity (e.g. a duplicate or unwanted import). */
export function useDeleteActivity() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => repo.deleteActivity(user!.id, activityId),
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

/** Log a single metric by hand — e.g. weight typed in without a connected scale. */
export function useAddHealthMetric() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HealthMetricInput) => repo.addHealthMetric(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health', user?.id] });
    },
  });
}

/** Remove a single health metric entry — e.g. to resolve a duplicate reading. */
export function useDeleteHealthMetric() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (metricId: string) => repo.deleteHealthMetric(user!.id, metricId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health', user?.id] });
    },
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

export function useAddSleepSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (session: NewSleepSession) => repo.addSleepSession(user!.id, session),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sleepSessions', user?.id] });
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
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['nutrition', user?.id] });
      void mirrorToHealthKit(() => saveNutritionToHealthKit(input));
    },
  });
}

export function useDeleteNutritionEntry() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => repo.deleteNutritionEntry(user!.id, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', user?.id] });
    },
  });
}

export function useUpdateNutritionEntry() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { entryId: string; kcal?: number; proteinG?: number; carbG?: number; fatG?: number; mealType?: MealType; loggedAt?: string }) =>
      repo.updateNutritionEntry(user!.id, input.entryId, input),
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

export function useUpdateHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { habitId: string; name: string; pillar: HabitInput['pillar']; cadence: HabitInput['cadence']; targetPerPeriod: number }) =>
      repo.updateHabit(user!.id, input.habitId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits', user?.id] });
    },
  });
}

export function useArchiveHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: string) => repo.archiveHabit(user!.id, habitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits', user?.id] });
    },
  });
}

export function useCustomExercises() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['customExercises', user?.id],
    enabled: !!user,
    queryFn: () => repo.listCustomExercises(user!.id),
  });
}

export function useAddCustomExercise() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomExerciseInput) => repo.addCustomExercise(user!.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customExercises', user?.id] });
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

/**
 * Borne une écriture qui pourrait ne jamais répondre. Sans ça, une requête
 * suspendue laisse l'écran sur son indicateur de chargement indéfiniment, sans
 * succès ni erreur — invisible pour l'utilisateur comme pour le diagnostic.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: délai dépassé (${ms / 1000} s)`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const WRITE_TIMEOUT_MS = 12_000;

export function useLogHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, completedAt }: { habitId: string; completedAt?: string }) =>
      withTimeout(repo.logHabit(user!.id, habitId, completedAt), WRITE_TIMEOUT_MS, 'logHabit'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habitLogs', user?.id] });
    },
  });
}

/** Undo one completion — e.g. unchecking a habit that's already logged today. */
export function useUnlogHabit() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: string) => withTimeout(repo.deleteHabitLog(user!.id, logId), WRITE_TIMEOUT_MS, 'deleteHabitLog'),
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

export function useLeaderboardPrefs() {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['leaderboardPrefs', user?.id],
    enabled: !!user,
    queryFn: () => repo.getLeaderboardPrefs(user!.id),
  });
}

export function useUpdateLeaderboardPrefs() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { displayName?: string; leaderboardOptIn?: boolean }) => repo.updateLeaderboardPrefs(user!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaderboardPrefs', user?.id] });
      // Opting in/out changes who appears in the standings — refetch them too.
      qc.invalidateQueries({ queryKey: ['generalLeaderboard'] });
    },
  });
}

/** Upsert today's value for one score column — call from a screen once the value is known, gated on leaderboard opt-in. */
export function useRecordDailyScore() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { column: DailyScoreColumn; value: number }) => repo.recordDailyScore(user!.id, input.column, input.value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generalLeaderboard'] });
    },
  });
}

export function useLeaderboard(category: LeaderboardCategory, period: LeaderboardPeriod) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['generalLeaderboard', category, period, user?.id],
    enabled: !!user,
    queryFn: () => repo.getLeaderboard(user!.id, category, periodToDays(period)),
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

export function useSessionBlocks(sessionId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['sessionBlocks', sessionId],
    enabled: !!user && !!sessionId,
    queryFn: () => repo.getSessionBlocks(user!.id, sessionId!),
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

export function useUpdateUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: UserSessionInput }) =>
      repo.updateUserSession(user!.id, sessionId, input),
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ['userSessions', user?.id] });
      // Les blocs et exercices sont entièrement réécrits : leurs caches, qui
      // alimentent aussi le lancement de la séance, deviennent faux sans ça.
      qc.invalidateQueries({ queryKey: ['sessionBlocks', sessionId] });
      qc.invalidateQueries({ queryKey: ['sessionExercises', sessionId] });
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

/** Every program's week×day slots at once — e.g. to flatten "which sessions belong to which program" for a picker, without breaking the rules of hooks over a variable-length program list. */
export function useAllProgramSessions(programIds: string[]) {
  const repo = useRepository();
  return useQueries({
    queries: programIds.map((programId) => ({
      queryKey: ['programSessions', programId],
      queryFn: () => repo.getProgramSessions(programId),
    })),
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

export function useUpdateUserProgram() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: UserProgramInput }) =>
      repo.updateUserProgram(user!.id, programId, input),
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

/** Fetch a session's exercises and log them as a real workout — "Lancer" a template. */
export function useLaunchSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (session: { id: string; name: string }) => {
      const [blocks, exercises] = await Promise.all([
        repo.getSessionBlocks(user!.id, session.id),
        repo.getSessionExercises(session.id),
      ]);
      // Real blocks when the library saved them (post block-support saves);
      // a legacy flat session (saved before this, block_id always null) falls
      // back to exactly the previous behavior — one synthetic 'strength'
      // block, so it's still eligible for the live runner even without a
      // remembered format.
      const workoutBlocks =
        blocks.length > 0
          ? blocks.map((b) => ({
              format: b.format,
              timeCapSec: b.timeCapSec,
              targetRounds: b.targetRounds,
              sets: exercises
                .filter((e) => e.blockId === b.id)
                .map((e) => ({
                  exerciseId: e.exerciseId,
                  order: e.order,
                  reps: e.reps,
                  weightKg: e.weightKg,
                  durationSec: e.durationSec,
                  restSec: e.restSec,
                })),
            }))
          : [
              {
                format: 'strength' as const,
                sets: exercises.map((e, i) => ({
                  exerciseId: e.exerciseId,
                  order: e.order ?? i,
                  reps: e.reps,
                  weightKg: e.weightKg,
                  durationSec: e.durationSec,
                  restSec: e.restSec,
                })),
              },
            ];
      // A single or multi-block workout (never blockless) so the launched
      // session is immediately eligible for the live runner — WorkoutDetailScreen's
      // "Commencer" button, and CircuitRunnerScreen itself, both require at
      // least one workout_blocks row.
      return repo.addCircuitWorkout(user!.id, { name: session.name, blocks: workoutBlocks });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}

export function useImportHealth() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      activities: ImportedActivity[];
      healthMetrics: ImportedHealthMetric[];
      records: ImportedRecord[];
      sleepSessions: ImportedSleepSession[];
      workouts: ImportedWorkout[];
    }) => {
      // HealthKit's own external_id dedup only catches the exact same sample
      // synced twice — it does nothing when the same real-world session was
      // recorded by more than one source (Watch workout + phone auto-detect,
      // or a third-party app also writing to HealthKit), since each of those
      // gets its own distinct uuid. Fuzzy-match (type + day + close duration)
      // against what's already stored to catch that case before it's persisted
      // as a second real row (reported: "Football" logged 3x after build 44).
      const existing = payload.activities.length > 0 ? await repo.listActivities(user!.id) : [];
      const activities = dedupActivities(existing, payload.activities);
      return repo.persistImport(user!.id, { ...payload, activities });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', user?.id] });
      qc.invalidateQueries({ queryKey: ['health', user?.id] });
      qc.invalidateQueries({ queryKey: ['records', user?.id] });
      qc.invalidateQueries({ queryKey: ['sleepSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleWork', user?.id] });
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

export function useUpdateGoal() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      goalId,
      title,
      type,
      targetValue,
      targetUnit,
      deadline,
    }: {
      goalId: string;
      title: string;
      type: GoalType;
      targetValue?: number;
      targetUnit?: string;
      deadline?: string;
    }) => repo.updateGoal(user!.id, goalId, { title, type, targetValue, targetUnit, deadline }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals', user?.id] });
    },
  });
}

export function useDeleteGoal() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => repo.deleteGoal(user!.id, goalId),
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
    // No HealthKit mirror here — addWorkout always creates the workout as
    // 'planned' (see repository.ts), so writing to Apple Santé at this point
    // would record a session before it's actually been done. The real write
    // happens in useSetWorkoutStatus, when status actually flips to 'completed'.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}

export function useAddCircuitWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workout: NewCircuitWorkout) => repo.addCircuitWorkout(user!.id, workout),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
    },
  });
}

export function useWorkoutBlocks(workoutId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['workoutBlocks', workoutId],
    enabled: !!user && !!workoutId,
    queryFn: () => repo.getWorkoutBlocks(user!.id, workoutId!),
  });
}

export function useBlockSets(blockId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['blockSets', blockId],
    enabled: !!user && !!blockId,
    queryFn: () => repo.getBlockSets(user!.id, blockId!),
  });
}

export function useCompleteBlock() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { blockId: string; workoutId: string; completedRounds?: number; resultTimeSec?: number }) =>
      repo.completeBlock(user!.id, input.blockId, { completedRounds: input.completedRounds, resultTimeSec: input.resultTimeSec }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['workoutBlocks', input.workoutId] });
    },
  });
}

/**
 * Invalide tout ce qui dépend des séries d'une séance. Les trois mutations du
 * runner écrivent la même table, elles partagent donc la même invalidation.
 */
function invalidateSets(qc: ReturnType<typeof useQueryClient>, userId: string | undefined, workoutId: string): void {
  qc.invalidateQueries({ queryKey: ['workoutSets', workoutId] });
  qc.invalidateQueries({ queryKey: ['blockSets'] });
  qc.invalidateQueries({ queryKey: ['workouts', userId] });
  qc.invalidateQueries({ queryKey: ['exerciseHistory', userId] });
}

export function useLogSet() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; workoutId: string; done: SetLogInput }) =>
      repo.logSet(user!.id, input.setId, input.done),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
  });
}

export function useClearSetLog() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; workoutId: string }) => repo.clearSetLog(user!.id, input.setId),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
  });
}

export function useAddSetsToWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutId: string; sets: NewRunnerSet[] }) =>
      repo.addSetsToWorkout(user!.id, input.workoutId, input.sets),
    onSuccess: (_d, input) => invalidateSets(qc, user?.id, input.workoutId),
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

/** Reschedule a session (planned, done, or skipped) onto a new date, carrying its exercises along — so "same session again" doesn't mean retyping everything. */
export function useReprogramWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workoutId: string; name: string; notes?: string; plannedFor: string }) => {
      const [blocks, sets] = await Promise.all([
        repo.getWorkoutBlocks(user!.id, input.workoutId),
        repo.getWorkoutSets(user!.id, input.workoutId),
      ]);
      if (blocks.length > 0) {
        return repo.addPlannedWorkout(user!.id, {
          name: input.name,
          plannedFor: input.plannedFor,
          notes: input.notes,
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.timeCapSec,
            targetRounds: b.targetRounds,
            sets: sets
              .filter((s) => s.blockId === b.id)
              .map(({ exerciseId, order, reps, weightKg, restSec }) => ({
                exerciseId,
                order,
                reps,
                weightKg,
                restSec,
              })),
          })),
        });
      }
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: sets.map(({ exerciseId, order, reps, weightKg, restSec, rpe }) => ({
          exerciseId,
          order,
          reps,
          weightKg,
          restSec,
          rpe,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
    },
  });
}

/** Schedule a new session by copying a user-created template's (Mes séances, or one belonging to a program) exercises. */
export function usePlanUserSession() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; name: string; plannedFor: string; notes?: string }) => {
      const [blocks, exercises] = await Promise.all([
        repo.getSessionBlocks(user!.id, input.sessionId),
        repo.getSessionExercises(input.sessionId),
      ]);
      if (blocks.length > 0) {
        return repo.addPlannedWorkout(user!.id, {
          name: input.name,
          plannedFor: input.plannedFor,
          notes: input.notes,
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.timeCapSec,
            targetRounds: b.targetRounds,
            sets: exercises
              .filter((e) => e.blockId === b.id)
              .map((e) => ({
                exerciseId: e.exerciseId,
                order: e.order,
                reps: e.reps,
                weightKg: e.weightKg,
                durationSec: e.durationSec,
                restSec: e.restSec,
              })),
          })),
        });
      }
      return repo.addPlannedWorkout(user!.id, {
        name: input.name,
        plannedFor: input.plannedFor,
        notes: input.notes,
        sets: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          order: e.order,
          reps: e.reps,
          weightKg: e.weightKg,
          durationSec: e.durationSec,
          restSec: e.restSec,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
    },
  });
}

/** Bulk-schedule a whole program's week×day slots at once, each carrying its session's exercises — the dates are computed by the caller (from the chosen anchor day) and passed in already resolved. */
export function useScheduleProgramEntries() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: { sessionId: string; name: string; plannedFor: string }[]) => {
      for (const entry of entries) {
        const exercises = await repo.getSessionExercises(entry.sessionId);
        await repo.addPlannedWorkout(user!.id, {
          name: entry.name,
          plannedFor: entry.plannedFor,
          sets: exercises.map((e) => ({
            exerciseId: e.exerciseId,
            order: e.order,
            reps: e.reps,
            weightKg: e.weightKg,
            durationSec: e.durationSec,
            restSec: e.restSec,
          })),
        });
      }
      return entries.length;
    },
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
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      // This is the actual "I finished this session" moment — mirror it to
      // Apple Santé here rather than at creation time (still 'planned' then),
      // and best-effort pull back the heart rate a connected watch recorded
      // over the same (estimated) window.
      if (input.status === 'completed') {
        void mirrorToHealthKit(async () => {
          const sets = await repo.getWorkoutSets(user!.id, input.workoutId);
          const completedAtIso = input.completedAt ?? new Date().toISOString();
          await saveWorkoutToHealthKit(sets.length, new Date(completedAtIso));
          const window = estimateWorkoutHeartRateWindow(completedAtIso, sets.length);
          const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
          if (summary) await repo.setWorkoutHeartRate(user!.id, input.workoutId, summary);
        });
      }
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
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}

export function useWorkoutSets(workoutId: string | undefined) {
  const { user } = useAuth();
  const repo = useRepository();
  return useQuery({
    queryKey: ['workoutSets', workoutId],
    enabled: !!user && !!workoutId,
    queryFn: () => repo.getWorkoutSets(user!.id, workoutId!),
  });
}

export function useEditWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutId: string; name: string; notes?: string; sets: Omit<SetEntry, 'id' | 'workoutId'>[] }) =>
      repo.editWorkout(user!.id, input.workoutId, input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workoutSets', input.workoutId] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}

/** Edit a multi-block session — same as useEditWorkout but replaces blocks (+ each block's exercises) instead of a flat set list. */
export function useEditCircuitWorkout() {
  const { user } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutId: string; name: string; notes?: string; blocks: NewCircuitBlockInput[] }) =>
      repo.editCircuitWorkout(user!.id, input.workoutId, input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['workouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['plannedWorkouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['workoutBlocks', input.workoutId] });
      qc.invalidateQueries({ queryKey: ['muscleSessions', user?.id] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory', user?.id] });
    },
  });
}
