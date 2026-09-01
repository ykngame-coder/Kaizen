import type {
  Activity,
  BlockFormat,
  Challenge,
  Exercise,
  Goal,
  GoalType,
  HealthMetric,
  HealthMetricType,
  Habit,
  HabitLog,
  MuscleGroup,
  NutritionEntry,
  PersonalRecord,
  Program,
  Workout,
  WorkoutBlock,
  SetEntry,
  SleepSession,
  UserProgram,
  UserProgramSession,
  UserSession,
  UserSessionExercise,
  Visibility,
  WellnessCheckin,
  GeneralLeaderboardEntry,
} from '@supotsu/core';
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
import { computeGoalProgress, generateProgramSchedule, nightDateKey, resolveSleepSessionInsert } from '@supotsu/engines';
import { PROGRAM_CATALOG } from '@supotsu/shared';
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
  ImportedWorkout,
} from '@supotsu/connectors';
import type { MuscleSession } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES as FULL_EXERCISE_CATALOG } from '@/features/exercises/catalog';
import { categoryToColumn, defaultDisplayName, localDateKey, type DailyScoreColumn, type LeaderboardCategory } from '@/features/community/leaderboardHelpers';
import { buildActivityMuscleSessions } from './muscleSessions';
import {
  insertActivity,
  upsertActivities,
  listActivities as listActivitiesDb,
  updateActivityMuscles as updateActivityMusclesDb,
  deleteActivity as deleteActivityDb,
  insertWorkout,
  insertWorkoutWithBlocks as insertWorkoutWithBlocksDb,
  listBlocksForWorkout as listBlocksForWorkoutDb,
  listSetsForBlock as listSetsForBlockDb,
  updateBlockResult as updateBlockResultDb,
  type WorkoutBlockRow,
  upsertImportedWorkouts,
  insertPlannedWorkout,
  listPlannedWorkouts as listPlannedWorkoutsDb,
  updateWorkoutStatus as updateWorkoutStatusDb,
  deleteWorkout as deleteWorkoutDb,
  listSetsForWorkout,
  updateWorkout as updateWorkoutDb,
  replaceWorkoutSets as replaceWorkoutSetsDb,
  replaceWorkoutBlocks as replaceWorkoutBlocksDb,
  listWorkouts as listWorkoutsDb,
  listWorkoutSetsForUser,
  listLoggedSets as listLoggedSetsDb,
  insertHealthMetrics,
  listHealthMetrics as listHealthMetricsDb,
  deleteHealthMetric as deleteHealthMetricDb,
  insertSleepSession,
  insertSleepSessions,
  listSleepSessions as listSleepSessionsDb,
  insertNutritionEntry,
  listNutritionEntries as listNutritionEntriesDb,
  deleteNutritionEntry as deleteNutritionEntryDb,
  updateNutritionEntry as updateNutritionEntryDb,
  insertHabit,
  listHabits as listHabitsDb,
  updateHabit as updateHabitDb,
  archiveHabit as archiveHabitDb,
  insertHabitLog,
  listHabitLogs as listHabitLogsDb,
  deleteHabitLog as deleteHabitLogDb,
  insertCustomExercise as insertCustomExerciseDb,
  listCustomExercises as listCustomExercisesDb,
  insertChallenge,
  listChallenges as listChallengesDb,
  listMyParticipations,
  joinChallenge as joinChallengeDb,
  fetchLeaderboard,
  listPrograms as listProgramsDb,
  listEnrollments as listEnrollmentsDb,
  enrollInProgram,
  listUserSessions as listUserSessionsDb,
  listCommunitySessions as listCommunitySessionsDb,
  getUserSession as getUserSessionDb,
  listSessionExercises as listSessionExercisesDb,
  insertUserSession as insertUserSessionDb,
  updateUserSessionVisibility as updateUserSessionVisibilityDb,
  deleteUserSession as deleteUserSessionDb,
  listUserPrograms as listUserProgramsDb,
  listCommunityPrograms as listCommunityProgramsDb,
  getUserProgram as getUserProgramDb,
  listProgramSessions as listProgramSessionsDb,
  insertUserProgram as insertUserProgramDb,
  updateUserProgramVisibility as updateUserProgramVisibilityDb,
  deleteUserProgram as deleteUserProgramDb,
  insertProgramSession as insertProgramSessionDb,
  deleteProgramSession as deleteProgramSessionDb,
  upsertRecords,
  listRecords as listRecordsDb,
  insertWellnessCheckin,
  listWellnessCheckins as listWellnessCheckinsDb,
  insertGoal,
  listGoals as listGoalsDb,
  updateGoalCurrent,
  updateGoal as updateGoalDb,
  deleteGoal as deleteGoalDb,
  getAthleteProfile as getAthleteProfileDb,
  upsertAthleteProfile,
  getProfile as getProfileDb,
  updateLeaderboardPrefs as updateLeaderboardPrefsDb,
  upsertDailyScore as upsertDailyScoreDb,
  fetchGeneralLeaderboard as fetchGeneralLeaderboardDb,
  type ActivityRow,
  type WorkoutRow,
  type HealthMetricRow,
  type SleepSessionRow,
  type NutritionEntryRow,
  type HabitRow,
  type HabitLogRow,
  type ExerciseRow,
  type ChallengeRow,
  type ProgramRow,
  type RecordRow,
  type WellnessCheckinRow,
  type GoalRow,
  type UserSessionRow,
  type UserSessionExerciseRow,
  type UserProgramRow,
  type UserProgramSessionRow,
} from '@supotsu/database';
import { getSupabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secure-storage';
import { randomId } from '@/lib/id';

/** Local (device-timezone) calendar-day key, matching the `planned_for` DATE column. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface NewWorkout {
  name: string;
  sets: Omit<SetEntry, 'id' | 'workoutId'>[];
}

export interface NewCircuitBlockInput {
  format: BlockFormat;
  timeCapSec?: number;
  targetRounds?: number;
  sets: Omit<SetEntry, 'id' | 'workoutId' | 'blockId'>[];
}

/** A session made of one or more ordered blocks (Musculation/AMRAP/EMOM/Pour le temps). */
export interface NewCircuitWorkout {
  name: string;
  blocks: NewCircuitBlockInput[];
}

/** A future training session to schedule. */
export interface PlannedInput {
  name: string;
  /** ISO date (YYYY-MM-DD) the session is planned for. */
  plannedFor: string;
  notes?: string;
  /** Optional exercise list, e.g. when reprogramming a past session or planning from a template. */
  sets?: Omit<SetEntry, 'id' | 'workoutId'>[];
}

/** A hand-entered health metric (no connected device/scale involved). */
export interface HealthMetricInput {
  type: HealthMetricType;
  value: number;
  unit: string;
  /** ISO datetime; defaults to now if omitted. */
  measuredAt?: string;
}

export type NewSleepSession = Omit<SleepSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

export interface AddSleepSessionResult {
  /** The session actually on record for that night — the new one, or the pre-existing one when skipped. */
  session: SleepSession;
  /** False when a same-night session from an equal-or-more-reliable source already existed (anti-doublon — see resolveSleepSessionInsert). */
  inserted: boolean;
}

export interface ImportPayload {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  records: ImportedRecord[];
  sleepSessions: ImportedSleepSession[];
  workouts: ImportedWorkout[];
}

/**
 * Unified data access for activities & workouts. A real Supabase implementation
 * is used when configured; otherwise a local (SecureStore/localStorage) store
 * keeps the app fully functional in demo mode. UI never imports either directly.
 */
export interface DataRepository {
  listActivities(userId: string): Promise<Activity[]>;
  addActivity(userId: string, input: ActivityInput): Promise<Activity>;
  /** Set (or clear) an activity's self-reported worked muscles. */
  updateActivityMuscles(userId: string, activityId: string, muscles: MuscleGroup[]): Promise<Activity>;
  /** Remove a logged/imported activity (e.g. a duplicate or unwanted import). */
  deleteActivity(userId: string, activityId: string): Promise<void>;
  listWorkouts(userId: string): Promise<Workout[]>;
  addWorkout(userId: string, workout: NewWorkout): Promise<Workout>;
  /** The user's planned (not-yet-done) sessions, soonest first. */
  listPlannedWorkouts(userId: string): Promise<Workout[]>;
  /** Schedule a future session. */
  addPlannedWorkout(userId: string, input: PlannedInput): Promise<Workout>;
  /** Change a session's status (mark a planned one done or skipped). */
  setWorkoutStatus(
    userId: string,
    workoutId: string,
    status: Workout['status'],
    completedAt?: string | null,
  ): Promise<Workout>;
  /** Remove a planned session. */
  deletePlannedWorkout(userId: string, workoutId: string): Promise<void>;
  /** The exercises/sets logged for one specific workout, in order. */
  getWorkoutSets(userId: string, workoutId: string): Promise<SetEntry[]>;
  /** Create a multi-block session (AMRAP/EMOM/Pour le temps/strength blocks in sequence). */
  addCircuitWorkout(userId: string, workout: NewCircuitWorkout): Promise<Workout>;
  /** A session's blocks, in order. */
  getWorkoutBlocks(userId: string, workoutId: string): Promise<WorkoutBlock[]>;
  /** The exercises logged for one specific block, in order. */
  getBlockSets(userId: string, blockId: string): Promise<SetEntry[]>;
  /** Record a finished block's result (rounds completed / elapsed time). */
  completeBlock(userId: string, blockId: string, result: { completedRounds?: number; resultTimeSec?: number }): Promise<WorkoutBlock>;
  /** Edit a session's name/notes and replace its exercise list wholesale. */
  editWorkout(userId: string, workoutId: string, patch: { name: string; notes?: string; sets: Omit<SetEntry, 'id' | 'workoutId'>[] }): Promise<void>;
  /** Edit a multi-block session's name/notes and replace its blocks (+ each block's exercises) wholesale. */
  editCircuitWorkout(userId: string, workoutId: string, patch: { name: string; notes?: string; blocks: NewCircuitBlockInput[] }): Promise<void>;
  listHealthMetrics(userId: string): Promise<HealthMetric[]>;
  /** Log a single metric by hand (e.g. weight typed in without a connected scale). Always recorded with source "manual". */
  addHealthMetric(userId: string, input: HealthMetricInput): Promise<HealthMetric>;
  /** Remove a single health metric entry (e.g. to resolve a duplicate reading). */
  deleteHealthMetric(userId: string, metricId: string): Promise<void>;
  listSleepSessions(userId: string): Promise<SleepSession[]>;
  /**
   * Record a phone-tracked (or otherwise single) night. Also writes the
   * matching sleep_duration/sleep_efficiency health metrics so
   * computeSleepScore2's "quantité" component (which reads HealthMetric[],
   * not sessions) still sees the night. Applies the anti-doublon rule
   * (resolveSleepSessionInsert) first — see AddSleepSessionResult.
   */
  addSleepSession(userId: string, session: NewSleepSession): Promise<AddSleepSessionResult>;
  listRecords(userId: string): Promise<PersonalRecord[]>;
  listMuscleSessions(userId: string): Promise<MuscleSession[]>;
  /** Per-muscle training volume over time (real progression). */
  listMuscleWork(userId: string): Promise<MuscleWork[]>;
  /** The most recent logged session's sets per exercise (progressive overload). */
  lastSessionSetsByExercise(userId: string): Promise<Record<string, SetEntry[]>>;
  listWellnessCheckins(userId: string): Promise<WellnessCheckin[]>;
  addWellnessCheckin(userId: string, input: WellnessCheckinInput): Promise<WellnessCheckin>;
  listGoals(userId: string): Promise<Goal[]>;
  addGoal(userId: string, input: GoalInput): Promise<Goal>;
  updateGoalCurrent(userId: string, goalId: string, currentValue: number): Promise<Goal>;
  updateGoal(
    userId: string,
    goalId: string,
    patch: { title: string; type: GoalType; targetValue?: number; targetUnit?: string; deadline?: string },
  ): Promise<Goal>;
  deleteGoal(userId: string, goalId: string): Promise<void>;
  getAthleteProfile(userId: string): Promise<AthleteProfileInput | null>;
  saveAthleteProfile(userId: string, input: AthleteProfileInput): Promise<void>;
  listNutritionEntries(userId: string): Promise<NutritionEntry[]>;
  addNutritionEntry(userId: string, input: NutritionEntryInput): Promise<NutritionEntry>;
  deleteNutritionEntry(userId: string, entryId: string): Promise<void>;
  /** Adjust a logged entry's calories/macros (e.g. a portion estimate corrected after the fact). */
  updateNutritionEntry(userId: string, entryId: string, patch: { kcal: number; proteinG?: number; carbG?: number; fatG?: number }): Promise<NutritionEntry>;
  listHabits(userId: string): Promise<Habit[]>;
  addHabit(userId: string, input: HabitInput): Promise<Habit>;
  /** Rename/retarget an existing habit. */
  updateHabit(userId: string, habitId: string, patch: { name: string; pillar: Habit['pillar']; cadence: Habit['cadence']; targetPerPeriod: number }): Promise<Habit>;
  /** Soft-delete: hides the habit from the active list, keeps its log history and streaks. */
  archiveHabit(userId: string, habitId: string): Promise<void>;
  listHabitLogs(userId: string): Promise<HabitLog[]>;
  logHabit(userId: string, habitId: string): Promise<HabitLog>;
  /** Undo one completion (e.g. unchecking a habit that's already logged today). */
  deleteHabitLog(userId: string, logId: string): Promise<void>;
  /** The caller's own exercises added on top of the bundled catalogue (e.g. home-gym equipment). */
  listCustomExercises(userId: string): Promise<Exercise[]>;
  addCustomExercise(userId: string, input: CustomExerciseInput): Promise<Exercise>;
  listChallenges(): Promise<Challenge[]>;
  createChallenge(userId: string, input: ChallengeInput): Promise<Challenge>;
  listMyChallengeIds(userId: string): Promise<string[]>;
  joinChallenge(userId: string, challengeId: string): Promise<void>;
  challengeLeaderboard(challenge: Challenge): Promise<{ userId: string; progress: number }[]>;
  /** The current user's leaderboard pseudo + opt-in flag. */
  getLeaderboardPrefs(userId: string): Promise<{ displayName: string | null; leaderboardOptIn: boolean }>;
  /** Update the pseudo and/or opt-in flag — either field optional. */
  updateLeaderboardPrefs(userId: string, patch: { displayName?: string; leaderboardOptIn?: boolean }): Promise<void>;
  /** Upsert today's value for one score column — no-op call site should gate this on opt-in first. */
  recordDailyScore(userId: string, column: DailyScoreColumn, value: number): Promise<void>;
  /** Ranked, averaged standings for one category over the last `days` days. */
  getLeaderboard(userId: string, category: LeaderboardCategory, days: number): Promise<GeneralLeaderboardEntry[]>;
  listPrograms(): Promise<Program[]>;
  listEnrolledProgramIds(userId: string): Promise<string[]>;
  enrollProgram(userId: string, programId: string): Promise<void>;

  // --- user-created séances & programmes (docs/superpowers/specs/2026-08-11-user-programs-design.md) ---
  /** The caller's own reusable session library. */
  listUserSessions(userId: string): Promise<UserSession[]>;
  /** Public sessions from other users. */
  listCommunitySessions(userId: string): Promise<UserSession[]>;
  getSessionExercises(sessionId: string): Promise<UserSessionExercise[]>;
  /** Rejects past the 50-session quota (server-enforced too). */
  addUserSession(userId: string, input: UserSessionInput): Promise<UserSession>;
  setSessionVisibility(userId: string, sessionId: string, visibility: Visibility): Promise<void>;
  deleteUserSession(userId: string, sessionId: string): Promise<void>;
  /** Clone a public (or own) session into the caller's own library, private by default. */
  copySession(userId: string, sourceSessionId: string): Promise<UserSession>;

  listUserPrograms(userId: string): Promise<UserProgram[]>;
  listCommunityPrograms(userId: string): Promise<UserProgram[]>;
  getProgramSessions(programId: string): Promise<UserProgramSession[]>;
  /** Rejects past the 2-program quota (server-enforced too). */
  addUserProgram(userId: string, input: UserProgramInput): Promise<UserProgram>;
  setProgramVisibility(userId: string, programId: string, visibility: Visibility): Promise<void>;
  deleteUserProgram(userId: string, programId: string): Promise<void>;
  /** Place one of the caller's own sessions at a week/day slot. */
  assignProgramSession(userId: string, programId: string, slot: ProgramSessionSlotInput): Promise<UserProgramSession>;
  removeProgramSession(userId: string, programSessionId: string): Promise<void>;
  /** Clone a public (or own) program AND its constituent sessions into the caller's own library. */
  copyProgram(userId: string, sourceProgramId: string): Promise<UserProgram>;

  /** Persist a validated connector import; returns how many rows were added. */
  persistImport(
    userId: string,
    payload: ImportPayload,
  ): Promise<{ activities: number; health: number; sleep: number; workouts: number }>;
}

// --- mapping helpers (DB row ⇄ core) --------------------------------------
function rowToActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as Activity['type'],
    source: r.source as Activity['source'],
    startedAt: r.started_at,
    durationSec: r.duration_sec,
    distanceM: r.distance_m ?? undefined,
    calories: r.calories ?? undefined,
    intensity: r.intensity ?? undefined,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    maxHeartRate: r.max_heart_rate ?? undefined,
    notes: r.notes ?? undefined,
    muscles: (r.muscles as MuscleGroup[] | null) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToWorkout(r: WorkoutRow): Workout {
  return {
    id: r.id,
    userId: r.user_id,
    programId: r.program_id ?? undefined,
    name: r.name,
    status: r.status,
    plannedFor: r.planned_for ?? undefined,
    completedAt: r.completed_at ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    rpe: r.rpe ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToWorkoutBlock(r: WorkoutBlockRow): WorkoutBlock {
  return {
    id: r.id,
    workoutId: r.workout_id,
    order: r.order,
    format: r.format,
    timeCapSec: r.time_cap_sec ?? undefined,
    targetRounds: r.target_rounds ?? undefined,
    completedRounds: r.completed_rounds ?? undefined,
    resultTimeSec: r.result_time_sec ?? undefined,
  };
}

function rowToHealthMetric(r: HealthMetricRow): HealthMetric {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as HealthMetric['type'],
    value: r.value,
    unit: r.unit,
    source: r.source as HealthMetric['source'],
    reliability: r.reliability ?? undefined,
    measuredAt: r.measured_at,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  };
}

function rowToSleepSession(r: SleepSessionRow): SleepSession {
  return {
    id: r.id,
    userId: r.user_id,
    source: r.source as SleepSession['source'],
    reliability: r.reliability ?? undefined,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    deepMin: r.deep_min,
    lightMin: r.light_min,
    remMin: r.rem_min,
    awakeMin: r.awake_min,
    asleepMin: r.asleep_min,
    inBedMin: r.in_bed_min,
    segments: (r.segments as unknown as SleepSession['segments']) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  };
}

/**
 * sleep_duration / sleep_efficiency health metrics derived from a session —
 * computeSleepScore2's "quantité" component reads HealthMetric[], not
 * sessions, so a session recorded on its own (no import alongside it, e.g.
 * phone tracking) needs these written too or that component stays null.
 * Same measuredAt-at-bedtime convention as healthAutoExport.ts.
 */
function sleepSessionMetrics(session: NewSleepSession): { type: HealthMetricType; value: number; unit: string; source: SleepSession['source']; reliability: SleepSession['reliability']; measuredAt: string }[] {
  const out = [
    {
      type: 'sleep_duration' as HealthMetricType,
      value: Number((session.asleepMin / 60).toFixed(2)),
      unit: 'h',
      source: session.source,
      reliability: session.reliability,
      measuredAt: session.startedAt,
    },
  ];
  if (session.inBedMin > 0) {
    out.push({
      type: 'sleep_efficiency' as HealthMetricType,
      value: Number(Math.min(100, (session.asleepMin / session.inBedMin) * 100).toFixed(1)),
      unit: 'score',
      source: session.source,
      reliability: session.reliability,
      measuredAt: session.startedAt,
    });
  }
  return out;
}

function rowToNutrition(r: NutritionEntryRow): NutritionEntry {
  return {
    id: r.id,
    userId: r.user_id,
    mealType: r.meal_type,
    description: r.description,
    kcal: r.kcal,
    proteinG: r.protein_g ?? undefined,
    carbG: r.carb_g ?? undefined,
    fatG: r.fat_g ?? undefined,
    hydrationMl: r.hydration_ml ?? undefined,
    source: r.source as NutritionEntry['source'],
    loggedAt: r.logged_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    pillar: r.pillar as Habit['pillar'],
    cadence: r.cadence,
    targetPerPeriod: r.target_per_period,
    archivedAt: r.archived_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Exercise['category'],
    primaryMuscles: r.primary_muscles as MuscleGroup[],
    secondaryMuscles: r.secondary_muscles as MuscleGroup[],
    equipment: r.equipment,
    level: r.level,
  };
}

function rowToHabitLog(r: HabitLogRow): HabitLog {
  return {
    id: r.id,
    userId: r.user_id,
    habitId: r.habit_id,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  };
}

function rowToChallenge(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description ?? undefined,
    metric: r.metric,
    target: r.target,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToProgram(r: ProgramRow): Program {
  // Session content isn't a DB column — it's static reference content
  // (like the exercise library), bundled with the app and looked up by id.
  const sessionTemplates = PROGRAM_CATALOG.find((p) => p.id === r.id)?.sessionTemplates ?? [];
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    focus: r.focus,
    level: r.level,
    weeks: r.weeks,
    sessionsPerWeek: r.sessions_per_week,
    description: r.description,
    priceCents: r.price_cents,
    sessionTemplates,
  };
}

function rowToUserSession(r: UserSessionRow): UserSession {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    notes: r.notes ?? undefined,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToUserSessionExercise(r: UserSessionExerciseRow): UserSessionExercise {
  return {
    id: r.id,
    sessionId: r.session_id,
    exerciseId: r.exercise_id,
    order: r.order,
    reps: r.reps ?? undefined,
    weightKg: r.weight_kg ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    restSec: r.rest_sec ?? undefined,
  };
}

function rowToUserProgram(r: UserProgramRow): UserProgram {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    focus: r.focus,
    level: r.level,
    weeks: r.weeks,
    description: r.description ?? undefined,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToUserProgramSession(r: UserProgramSessionRow): UserProgramSession {
  return {
    id: r.id,
    programId: r.program_id,
    sessionId: r.session_id,
    weekNumber: r.week_number,
    dayIndex: r.day_index,
    order: r.order,
  };
}

function rowToRecord(r: RecordRow): PersonalRecord {
  return {
    id: r.id,
    userId: r.user_id,
    externalId: r.external_id ?? undefined,
    label: r.label,
    category: r.category,
    value: r.value,
    unit: r.unit,
    source: r.source as PersonalRecord['source'],
    achievedAt: r.achieved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    description: r.description ?? undefined,
    priority: r.priority,
    targetValue: r.target_value ?? undefined,
    targetUnit: r.target_unit ?? undefined,
    startValue: r.start_value ?? undefined,
    currentValue: r.current_value ?? undefined,
    deadline: r.deadline ?? undefined,
    status: r.status,
    progress: r.progress,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Recompute a goal's progress + status after its current value changes. */
function progressedGoal(goal: Goal, currentValue: number): { progress: number; status: Goal['status'] } {
  const progress = computeGoalProgress({ ...goal, currentValue }, goal.startValue);
  return { progress, status: progress >= 1 ? 'achieved' : 'active' };
}

function rowToWellness(r: WellnessCheckinRow): WellnessCheckin {
  return {
    id: r.id,
    userId: r.user_id,
    mood: r.mood,
    energy: r.energy,
    stress: r.stress,
    note: r.note ?? undefined,
    checkedAt: r.checked_at,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  };
}

function importedToRecord(userId: string, r: ImportedRecord): PersonalRecord {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    userId,
    externalId: r.externalId,
    label: r.label,
    category: r.category,
    value: r.value,
    unit: r.unit,
    source: r.source,
    achievedAt: r.achievedAt,
    createdAt: now,
    updatedAt: now,
  };
}

/** Minimal shape buildMuscleSessions/buildMuscleWork need, normalized from either catalogue. */
interface MuscleLookupExercise {
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  isMobility: boolean;
}

/**
 * Union of both exercise catalogues an exercise_id can come from: the small
 * hand-curated EXERCISE_LIBRARY (Garmin-import mappings, 0016/0017 seeds) and
 * the 873-exercise free-exercise-db catalogue NewWorkoutScreen/
 * SessionBuilderScreen actually pick from (wired into logging by migration
 * 0018). Muscle-session building only ever looked at the former, so most
 * real logged sets silently vanished from the muscle-recovery map.
 */
const EXERCISE_BY_ID = new Map<string, MuscleLookupExercise>([
  ...EXERCISE_LIBRARY.map((e): [string, MuscleLookupExercise] => [
    e.id,
    { primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles, isMobility: e.category === 'mobility' },
  ]),
  ...FULL_EXERCISE_CATALOG.map((e): [string, MuscleLookupExercise] => [
    e.id,
    { primaryMuscles: [e.primary], secondaryMuscles: e.secondary, isMobility: e.category === 'mobilité' },
  ]),
]);

/** Build muscle sessions from logged sets: one per (workout, exercise) with muscles. */
function buildMuscleSessions(
  workoutDate: Map<string, string>,
  sets: { workoutId: string; exerciseId: string }[],
): MuscleSession[] {
  const seen = new Set<string>();
  const out: MuscleSession[] = [];
  for (const s of sets) {
    const key = `${s.workoutId}|${s.exerciseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const exercise = EXERCISE_BY_ID.get(s.exerciseId);
    const trainedAt = workoutDate.get(s.workoutId);
    if (!exercise || !trainedAt) continue;
    out.push({
      trainedAt,
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      recovery: exercise.isMobility,
    });
  }
  return out;
}

/** One muscle's training work from a single logged set (for real progression). */
export interface MuscleWork {
  trainedAt: string;
  muscle: MuscleGroup;
  /** Training volume: reps × load (tonnage), or reps for bodyweight sets. */
  volume: number;
  weightKg: number | null;
}

/** Expand logged sets into per-muscle volume entries (primary full, secondary half). */
function buildMuscleWork(dates: Map<string, string>, sets: LoggedSetRow[]): MuscleWork[] {
  const out: MuscleWork[] = [];
  for (const s of sets) {
    const exercise = EXERCISE_BY_ID.get(s.exerciseId);
    const trainedAt = dates.get(s.workoutId);
    if (!exercise || !trainedAt) continue;
    const reps = s.reps ?? 1;
    const vol = reps * (s.weightKg ?? 1);
    for (const m of exercise.primaryMuscles) out.push({ trainedAt, muscle: m, volume: vol, weightKg: s.weightKg });
    for (const m of exercise.secondaryMuscles) out.push({ trainedAt, muscle: m, volume: vol * 0.5, weightKg: s.weightKg });
  }
  return out;
}

interface LoggedSetRow {
  workoutId: string;
  blockId?: string;
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
  restSec?: number | null;
  supersetGroup?: number | null;
}

/** For each exercise, the sets of the most recent workout that contains it. */
function lastSessionByExercise(
  workoutDate: Map<string, string>,
  sets: LoggedSetRow[],
): Record<string, SetEntry[]> {
  const byExercise = new Map<string, LoggedSetRow[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }
  const result: Record<string, SetEntry[]> = {};
  for (const [exerciseId, list] of byExercise) {
    let latestId: string | undefined;
    let latestDate = '';
    for (const s of list) {
      const d = workoutDate.get(s.workoutId) ?? '';
      if (d > latestDate) {
        latestDate = d;
        latestId = s.workoutId;
      }
    }
    if (!latestId) continue;
    result[exerciseId] = list
      .filter((s) => s.workoutId === latestId)
      .map((s) => ({
        id: `${s.workoutId}-${s.order}`,
        workoutId: s.workoutId,
        exerciseId: s.exerciseId,
        order: s.order,
        reps: s.reps ?? undefined,
        weightKg: s.weightKg ?? undefined,
      }));
  }
  return result;
}

/** Count a user's activities inside a challenge window (demo leaderboard). */
function progressInWindow(challenge: Challenge, activities: Activity[]): number {
  const start = new Date(challenge.startsAt).getTime();
  const end = new Date(challenge.endsAt).getTime();
  const scoped = activities.filter((a) => {
    const t = new Date(a.startedAt).getTime();
    return t >= start && t <= end;
  });
  if (challenge.metric === 'active_days') {
    return new Set(scoped.map((a) => a.startedAt.slice(0, 10))).size;
  }
  return scoped.length;
}

function importedToActivity(userId: string, a: ImportedActivity): Activity {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    userId,
    type: a.type,
    source: a.source,
    startedAt: a.startedAt,
    durationSec: a.durationSec,
    distanceM: a.distanceM,
    calories: a.calories,
    intensity: a.intensity,
    avgHeartRate: a.avgHeartRate,
    createdAt: now,
    updatedAt: now,
  };
}

function importedToHealth(userId: string, m: ImportedHealthMetric): HealthMetric {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    userId,
    type: m.type,
    value: m.value,
    unit: m.unit,
    source: m.source,
    reliability: m.reliability,
    measuredAt: m.measuredAt,
    createdAt: now,
    updatedAt: now,
  };
}

function importedToSleepSession(userId: string, s: ImportedSleepSession): SleepSession {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    userId,
    source: s.source,
    reliability: s.reliability,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    deepMin: s.deepMin,
    lightMin: s.lightMin,
    remMin: s.remMin,
    awakeMin: s.awakeMin,
    asleepMin: s.asleepMin,
    inBedMin: s.inBedMin,
    segments: s.segments,
    createdAt: now,
    updatedAt: now,
  };
}

// --- demo (local) implementation ------------------------------------------
const actKey = (u: string): string => `supotsu.activities.${u}`;
const wkKey = (u: string): string => `supotsu.workouts.${u}`;
const setKey = (u: string): string => `supotsu.sets.${u}`;
const blockKey = (u: string): string => `supotsu.blocks.${u}`;
const hmKey = (u: string): string => `supotsu.health.${u}`;
const sleepKey = (u: string): string => `supotsu.sleep.${u}`;
const nutKey = (u: string): string => `supotsu.nutrition.${u}`;
const habKey = (u: string): string => `supotsu.habits.${u}`;
const hlogKey = (u: string): string => `supotsu.habitlogs.${u}`;
const customExKey = (u: string): string => `supotsu.customexercises.${u}`;
const recKey = (u: string): string => `supotsu.records.${u}`;
const wcKey = (u: string): string => `supotsu.wellness.${u}`;
const goalKey = (u: string): string => `supotsu.goals.${u}`;
const profKey = (u: string): string => `supotsu.athleteprofile.${u}`;
const chKey = (u: string): string => `supotsu.challenges.${u}`;
const chJoinKey = (u: string): string => `supotsu.challengejoins.${u}`;
const lbPrefsKey = (u: string): string => `supotsu.leaderboardprefs.${u}`;
const dailyScoreKey = (u: string): string => `supotsu.dailyscores.${u}`;
const enrollKey = (u: string): string => `supotsu.enrollments.${u}`;
// Demo mode is single-user (see listChallenges) — all user-created sessions/
// programs live under one shared local list, same as challenges.
const usKey = (): string => 'supotsu.usersessions.all';
const usExKey = (sessionId: string): string => `supotsu.usersessionexercises.${sessionId}`;
const upKey = (): string => 'supotsu.userprograms.all';
const upsKey = (programId: string): string => `supotsu.userprogramsessions.${programId}`;
const SESSIONS_QUOTA = 50;
const PROGRAMS_QUOTA = 2;

async function readJson<T>(key: string): Promise<T[]> {
  const raw = await secureStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
async function writeJson<T>(key: string, value: T[]): Promise<void> {
  await secureStorage.setItem(key, JSON.stringify(value));
}

function createDemoRepository(): DataRepository {
  return {
    async listActivities(userId) {
      const items = await readJson<Activity>(actKey(userId));
      return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async addActivity(userId, input) {
      const now = new Date().toISOString();
      const activity: Activity = {
        id: randomId(),
        userId,
        type: input.type,
        source: input.source,
        startedAt: input.startedAt,
        durationSec: input.durationSec,
        distanceM: input.distanceM,
        calories: input.calories,
        intensity: input.intensity,
        avgHeartRate: input.avgHeartRate,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Activity>(actKey(userId));
      await writeJson(actKey(userId), [activity, ...items]);
      return activity;
    },
    async updateActivityMuscles(userId, activityId, muscles) {
      const items = await readJson<Activity>(actKey(userId));
      let updated: Activity | undefined;
      const now = new Date().toISOString();
      const next = items.map((a) => {
        if (a.id !== activityId) return a;
        updated = { ...a, muscles, updatedAt: now };
        return updated;
      });
      if (!updated) throw new Error('Activité introuvable.');
      await writeJson(actKey(userId), next);
      return updated;
    },
    async deleteActivity(userId, activityId) {
      const items = await readJson<Activity>(actKey(userId));
      await writeJson(
        actKey(userId),
        items.filter((a) => a.id !== activityId),
      );
    },
    async listWorkouts(userId) {
      const items = await readJson<Workout>(wkKey(userId));
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async addWorkout(userId, workout) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: workout.name,
        status: 'planned',
        plannedFor: todayKey(),
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...items]);
      // Persist the sets so muscle map & progressive overload work in demo too.
      if (workout.sets.length > 0) {
        const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const added = workout.sets.map((s) => ({
          workoutId: created.id,
          exerciseId: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          restSec: s.restSec ?? null,
          date: now,
        }));
        await writeJson(setKey(userId), [...added, ...rows]);
      }
      return created;
    },
    async listPlannedWorkouts(userId) {
      const items = await readJson<Workout>(wkKey(userId));
      return items
        .filter((w) => w.status === 'planned')
        .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''));
    },
    async addPlannedWorkout(userId, input) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: input.name,
        status: 'planned',
        plannedFor: input.plannedFor,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...items]);
      if (input.sets && input.sets.length > 0) {
        const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const added = input.sets.map((s) => ({
          workoutId: created.id,
          exerciseId: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          restSec: s.restSec ?? null,
          date: now,
        }));
        await writeJson(setKey(userId), [...added, ...rows]);
      }
      return created;
    },
    async setWorkoutStatus(userId, workoutId, status, completedAt) {
      const items = await readJson<Workout>(wkKey(userId));
      const now = new Date().toISOString();
      let updated: Workout | undefined;
      const next = items.map((w) => {
        if (w.id !== workoutId) return w;
        updated = {
          ...w,
          status,
          completedAt: completedAt === undefined ? w.completedAt : completedAt ?? undefined,
          updatedAt: now,
        };
        return updated;
      });
      await writeJson(wkKey(userId), next);
      if (!updated) throw new Error('Séance introuvable.');
      return updated;
    },
    async deletePlannedWorkout(userId, workoutId) {
      const items = await readJson<Workout>(wkKey(userId));
      await writeJson(
        wkKey(userId),
        items.filter((w) => w.id !== workoutId),
      );
    },
    async getWorkoutSets(userId, workoutId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      return rows
        .filter((r) => r.workoutId === workoutId)
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          id: `${r.workoutId}-${r.order}`,
          workoutId: r.workoutId,
          blockId: r.blockId,
          exerciseId: r.exerciseId,
          order: r.order,
          reps: r.reps ?? undefined,
          weightKg: r.weightKg ?? undefined,
          restSec: r.restSec ?? undefined,
          supersetGroup: r.supersetGroup ?? undefined,
        }));
    },
    async addCircuitWorkout(userId, workout) {
      const now = new Date().toISOString();
      const created: Workout = {
        id: randomId(),
        userId,
        name: workout.name,
        status: 'planned',
        plannedFor: todayKey(),
        createdAt: now,
        updatedAt: now,
      };
      const workouts = await readJson<Workout>(wkKey(userId));
      await writeJson(wkKey(userId), [created, ...workouts]);

      const existingBlocks = await readJson<WorkoutBlock>(blockKey(userId));
      const existingSets = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const newBlocks: WorkoutBlock[] = [];
      const newSets: (LoggedSetRow & { date: string })[] = [];
      workout.blocks.forEach((b, i) => {
        const block: WorkoutBlock = {
          id: randomId(),
          workoutId: created.id,
          order: i,
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
        };
        newBlocks.push(block);
        b.sets.forEach((s) => {
          newSets.push({
            workoutId: created.id,
            blockId: block.id,
            exerciseId: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weightKg: s.weightKg ?? null,
            restSec: s.restSec ?? null,
            supersetGroup: s.supersetGroup ?? null,
            date: now,
          });
        });
      });
      await writeJson(blockKey(userId), [...newBlocks, ...existingBlocks]);
      await writeJson(setKey(userId), [...newSets, ...existingSets]);
      return created;
    },
    async getWorkoutBlocks(userId, workoutId) {
      const items = await readJson<WorkoutBlock>(blockKey(userId));
      return items.filter((b) => b.workoutId === workoutId).sort((a, b) => a.order - b.order);
    },
    async getBlockSets(userId, blockId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      return rows
        .filter((r) => r.blockId === blockId)
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          id: `${r.workoutId}-${r.blockId}-${r.order}`,
          workoutId: r.workoutId,
          blockId: r.blockId,
          exerciseId: r.exerciseId,
          order: r.order,
          reps: r.reps ?? undefined,
          weightKg: r.weightKg ?? undefined,
          restSec: r.restSec ?? undefined,
          supersetGroup: r.supersetGroup ?? undefined,
        }));
    },
    async completeBlock(userId, blockId, result) {
      const items = await readJson<WorkoutBlock>(blockKey(userId));
      let updated: WorkoutBlock | undefined;
      const next = items.map((b) => {
        if (b.id !== blockId) return b;
        updated = { ...b, ...result };
        return updated;
      });
      await writeJson(blockKey(userId), next);
      if (!updated) throw new Error('Bloc introuvable.');
      return updated;
    },
    async editWorkout(userId, workoutId, patch) {
      const now = new Date().toISOString();
      const workouts = await readJson<Workout>(wkKey(userId));
      const next = workouts.map((w) => (w.id === workoutId ? { ...w, name: patch.name, notes: patch.notes, updatedAt: now } : w));
      if (!next.some((w) => w.id === workoutId)) throw new Error('Séance introuvable.');
      await writeJson(wkKey(userId), next);

      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const kept = rows.filter((r) => r.workoutId !== workoutId);
      const added = patch.sets.map((s) => ({ workoutId, exerciseId: s.exerciseId, order: s.order, reps: s.reps ?? null, weightKg: s.weightKg ?? null, restSec: s.restSec ?? null, date: now }));
      await writeJson(setKey(userId), [...added, ...kept]);
    },
    async editCircuitWorkout(userId, workoutId, patch) {
      const now = new Date().toISOString();
      const workouts = await readJson<Workout>(wkKey(userId));
      const nextWorkouts = workouts.map((w) => (w.id === workoutId ? { ...w, name: patch.name, notes: patch.notes, updatedAt: now } : w));
      if (!nextWorkouts.some((w) => w.id === workoutId)) throw new Error('Séance introuvable.');
      await writeJson(wkKey(userId), nextWorkouts);

      const existingBlocks = await readJson<WorkoutBlock>(blockKey(userId));
      const keptBlocks = existingBlocks.filter((b) => b.workoutId !== workoutId);
      const existingSets = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const keptSets = existingSets.filter((r) => r.workoutId !== workoutId);

      const newBlocks: WorkoutBlock[] = [];
      const newSets: (LoggedSetRow & { date: string })[] = [];
      patch.blocks.forEach((b, i) => {
        const block: WorkoutBlock = { id: randomId(), workoutId, order: i, format: b.format, timeCapSec: b.timeCapSec, targetRounds: b.targetRounds };
        newBlocks.push(block);
        b.sets.forEach((s) => {
          newSets.push({ workoutId, blockId: block.id, exerciseId: s.exerciseId, order: s.order, reps: s.reps ?? null, weightKg: s.weightKg ?? null, restSec: s.restSec ?? null, supersetGroup: s.supersetGroup ?? null, date: now });
        });
      });
      await writeJson(blockKey(userId), [...newBlocks, ...keptBlocks]);
      await writeJson(setKey(userId), [...newSets, ...keptSets]);
    },
    async listHealthMetrics(userId) {
      const items = await readJson<HealthMetric>(hmKey(userId));
      return items.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    },
    async addHealthMetric(userId, input) {
      const now = new Date().toISOString();
      const created: HealthMetric = {
        id: randomId(),
        userId,
        type: input.type,
        value: input.value,
        unit: input.unit,
        source: 'manual',
        measuredAt: input.measuredAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<HealthMetric>(hmKey(userId));
      await writeJson(hmKey(userId), [created, ...items]);
      return created;
    },
    async deleteHealthMetric(userId, metricId) {
      const items = await readJson<HealthMetric>(hmKey(userId));
      await writeJson(hmKey(userId), items.filter((m) => m.id !== metricId));
    },
    async listSleepSessions(userId) {
      const items = await readJson<SleepSession>(sleepKey(userId));
      return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async addSleepSession(userId, session) {
      const existing = await readJson<SleepSession>(sleepKey(userId));
      const sameNight = existing.filter((s) => nightDateKey(s.endedAt) === nightDateKey(session.endedAt));
      const action = resolveSleepSessionInsert(sameNight, session.reliability ?? 'high');
      if (action === 'skip') {
        const rank = { low: 0, medium: 1, high: 2 } as const;
        const winner = [...sameNight].sort((a, b) => rank[b.reliability ?? 'high'] - rank[a.reliability ?? 'high'])[0]!;
        return { session: winner, inserted: false };
      }
      const now = new Date().toISOString();
      const created: SleepSession = { id: randomId(), userId, ...session, createdAt: now, updatedAt: now };
      await writeJson(sleepKey(userId), [created, ...existing]);
      const metrics = sleepSessionMetrics(session);
      if (metrics.length > 0) {
        const existingH = await readJson<HealthMetric>(hmKey(userId));
        const newH: HealthMetric[] = metrics.map((m) => ({ id: randomId(), userId, ...m, createdAt: now, updatedAt: now }));
        await writeJson(hmKey(userId), [...newH, ...existingH]);
      }
      return { session: created, inserted: true };
    },
    async listRecords(userId) {
      const items = await readJson<PersonalRecord>(recKey(userId));
      return items.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
    },
    async listMuscleSessions(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      const activities = await readJson<Activity>(actKey(userId));
      const workouts = await readJson<Workout>(wkKey(userId));
      return [...buildMuscleSessions(dates, rows), ...buildActivityMuscleSessions(activities, workouts)];
    },
    async listMuscleWork(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      return buildMuscleWork(dates, rows);
    },
    async lastSessionSetsByExercise(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      return lastSessionByExercise(dates, rows);
    },
    async listWellnessCheckins(userId) {
      const items = await readJson<WellnessCheckin>(wcKey(userId));
      return items.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
    },
    async addWellnessCheckin(userId, input) {
      const now = new Date().toISOString();
      const checkin: WellnessCheckin = {
        id: randomId(),
        userId,
        mood: input.mood,
        energy: input.energy,
        stress: input.stress,
        note: input.note,
        checkedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<WellnessCheckin>(wcKey(userId));
      await writeJson(wcKey(userId), [checkin, ...items]);
      return checkin;
    },
    async listGoals(userId) {
      const items = await readJson<Goal>(goalKey(userId));
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async addGoal(userId, input) {
      const now = new Date().toISOString();
      const goal: Goal = {
        id: randomId(),
        userId,
        type: input.type,
        title: input.title,
        description: input.description,
        priority: input.priority,
        targetValue: input.targetValue,
        targetUnit: input.targetUnit,
        startValue: input.currentValue,
        currentValue: input.currentValue,
        deadline: input.deadline,
        status: 'active',
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Goal>(goalKey(userId));
      await writeJson(goalKey(userId), [goal, ...items]);
      return goal;
    },
    async updateGoalCurrent(userId, goalId, currentValue) {
      const items = await readJson<Goal>(goalKey(userId));
      let updated: Goal | undefined;
      const next = items.map((g) => {
        if (g.id !== goalId) return g;
        const { progress, status } = progressedGoal(g, currentValue);
        updated = { ...g, currentValue, progress, status, updatedAt: new Date().toISOString() };
        return updated;
      });
      if (!updated) throw new Error('Objectif introuvable.');
      await writeJson(goalKey(userId), next);
      return updated;
    },
    async updateGoal(userId, goalId, patch) {
      const items = await readJson<Goal>(goalKey(userId));
      let updated: Goal | undefined;
      const next = items.map((g) => {
        if (g.id !== goalId) return g;
        updated = { ...g, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      });
      if (!updated) throw new Error('Objectif introuvable.');
      await writeJson(goalKey(userId), next);
      return updated;
    },
    async deleteGoal(userId, goalId) {
      const items = await readJson<Goal>(goalKey(userId));
      await writeJson(goalKey(userId), items.filter((g) => g.id !== goalId));
    },
    async getAthleteProfile(userId) {
      const raw = await secureStorage.getItem(profKey(userId));
      return raw ? (JSON.parse(raw) as AthleteProfileInput) : null;
    },
    async saveAthleteProfile(userId, input) {
      await secureStorage.setItem(profKey(userId), JSON.stringify(input));
    },
    async listNutritionEntries(userId) {
      const items = await readJson<NutritionEntry>(nutKey(userId));
      return items.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    },
    async addNutritionEntry(userId, input) {
      const now = new Date().toISOString();
      const entry: NutritionEntry = {
        id: randomId(),
        userId,
        mealType: input.mealType,
        description: input.description,
        kcal: input.kcal,
        proteinG: input.proteinG,
        carbG: input.carbG,
        fatG: input.fatG,
        hydrationMl: input.hydrationMl,
        source: input.source,
        loggedAt: input.loggedAt,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<NutritionEntry>(nutKey(userId));
      await writeJson(nutKey(userId), [entry, ...items]);
      return entry;
    },
    async deleteNutritionEntry(userId, entryId) {
      const items = await readJson<NutritionEntry>(nutKey(userId));
      await writeJson(nutKey(userId), items.filter((e) => e.id !== entryId));
    },
    async updateNutritionEntry(userId, entryId, patch) {
      const items = await readJson<NutritionEntry>(nutKey(userId));
      let updated: NutritionEntry | undefined;
      const next = items.map((e) => {
        if (e.id !== entryId) return e;
        updated = { ...e, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      });
      if (!updated) throw new Error('Nutrition entry not found');
      await writeJson(nutKey(userId), next);
      return updated;
    },
    async listHabits(userId) {
      const items = await readJson<Habit>(habKey(userId));
      return items.filter((h) => !h.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async addHabit(userId, input) {
      const now = new Date().toISOString();
      const habit: Habit = {
        id: randomId(),
        userId,
        name: input.name,
        pillar: input.pillar,
        cadence: input.cadence,
        targetPerPeriod: input.targetPerPeriod,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Habit>(habKey(userId));
      await writeJson(habKey(userId), [...items, habit]);
      return habit;
    },
    async updateHabit(userId, habitId, patch) {
      const items = await readJson<Habit>(habKey(userId));
      let updated: Habit | undefined;
      const next = items.map((h) => {
        if (h.id !== habitId) return h;
        updated = { ...h, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      });
      if (!updated) throw new Error('Habitude introuvable.');
      await writeJson(habKey(userId), next);
      return updated;
    },
    async archiveHabit(userId, habitId) {
      const items = await readJson<Habit>(habKey(userId));
      const now = new Date().toISOString();
      await writeJson(habKey(userId), items.map((h) => (h.id === habitId ? { ...h, archivedAt: now, updatedAt: now } : h)));
    },
    async listCustomExercises(userId) {
      return readJson<Exercise>(customExKey(userId));
    },
    async addCustomExercise(userId, input) {
      const exercise: Exercise = {
        id: `custom-${randomId()}`,
        name: input.name,
        category: 'strength',
        primaryMuscles: [input.primaryMuscle],
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment ? [input.equipment] : [],
        level: 'beginner',
      };
      const items = await readJson<Exercise>(customExKey(userId));
      await writeJson(customExKey(userId), [...items, exercise]);
      return exercise;
    },
    async listHabitLogs(userId) {
      const items = await readJson<HabitLog>(hlogKey(userId));
      return items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    },
    async logHabit(userId, habitId) {
      const now = new Date().toISOString();
      const log: HabitLog = {
        id: randomId(),
        userId,
        habitId,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<HabitLog>(hlogKey(userId));
      await writeJson(hlogKey(userId), [log, ...items]);
      return log;
    },
    async deleteHabitLog(userId, logId) {
      const items = await readJson<HabitLog>(hlogKey(userId));
      await writeJson(hlogKey(userId), items.filter((l) => l.id !== logId));
    },
    async listChallenges() {
      // Demo mode is single-user: all challenges live under one local list.
      return readJson<Challenge>(chKey('all'));
    },
    async createChallenge(userId, input) {
      const now = new Date().toISOString();
      const challenge: Challenge = {
        id: randomId(),
        userId,
        title: input.title,
        description: input.description,
        metric: input.metric,
        target: input.target,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        visibility: input.visibility,
        createdAt: now,
        updatedAt: now,
      };
      const items = await readJson<Challenge>(chKey('all'));
      await writeJson(chKey('all'), [challenge, ...items]);
      // Auto-join your own challenge.
      const joins = await readJson<string>(chJoinKey(userId));
      await writeJson(chJoinKey(userId), [challenge.id, ...joins]);
      return challenge;
    },
    async listMyChallengeIds(userId) {
      return readJson<string>(chJoinKey(userId));
    },
    async joinChallenge(userId, challengeId) {
      const joins = await readJson<string>(chJoinKey(userId));
      if (!joins.includes(challengeId)) await writeJson(chJoinKey(userId), [challengeId, ...joins]);
    },
    async challengeLeaderboard(challenge) {
      const activities = await readJson<Activity>(actKey(challenge.userId));
      return [{ userId: challenge.userId, progress: progressInWindow(challenge, activities) }];
    },
    async getLeaderboardPrefs(userId) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      return raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
    },
    async updateLeaderboardPrefs(userId, patch) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      const current = raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
      const next = {
        displayName: patch.displayName !== undefined ? patch.displayName : current.displayName,
        leaderboardOptIn: patch.leaderboardOptIn !== undefined ? patch.leaderboardOptIn : current.leaderboardOptIn,
      };
      await secureStorage.setItem(lbPrefsKey(userId), JSON.stringify(next));
    },
    async recordDailyScore(userId, column, value) {
      const today = localDateKey(new Date());
      const rows = await readJson<{ date: string; kaizen?: number; sport?: number; nutrition?: number; sleep?: number }>(dailyScoreKey(userId));
      const idx = rows.findIndex((r) => r.date === today);
      if (idx >= 0) rows[idx] = { ...rows[idx], [column]: value };
      else rows.push({ date: today, [column]: value });
      await writeJson(dailyScoreKey(userId), rows);
    },
    async getLeaderboard(userId, category, days) {
      const raw = await secureStorage.getItem(lbPrefsKey(userId));
      const prefs = raw
        ? (JSON.parse(raw) as { displayName: string | null; leaderboardOptIn: boolean })
        : { displayName: null, leaderboardOptIn: false };
      if (!prefs.leaderboardOptIn) return [];
      const rows = await readJson<{ date: string; kaizen?: number; sport?: number; nutrition?: number; sleep?: number }>(dailyScoreKey(userId));
      const column = categoryToColumn(category);
      const cutoff = localDateKey(new Date(Date.now() - days * 86_400_000));
      const inWindow = rows.filter((r) => r.date >= cutoff && r[column] != null);
      if (inWindow.length === 0) return [];
      const avg = inWindow.reduce((sum, r) => sum + (r[column] as number), 0) / inWindow.length;
      return [
        {
          userId,
          displayName: prefs.displayName ?? defaultDisplayName(userId),
          avatarUrl: undefined,
          avgScore: Math.round(avg),
          rank: 1,
        },
      ];
    },
    async listPrograms() {
      return PROGRAM_CATALOG;
    },
    async listEnrolledProgramIds(userId) {
      return readJson<string>(enrollKey(userId));
    },
    async enrollProgram(userId, programId) {
      const ids = await readJson<string>(enrollKey(userId));
      if (ids.includes(programId)) return; // already enrolled — don't regenerate the schedule
      await writeJson(enrollKey(userId), [programId, ...ids]);

      const program = PROGRAM_CATALOG.find((p) => p.id === programId);
      if (!program) return;
      const now = new Date().toISOString();
      const schedule = generateProgramSchedule(program);
      const workouts = await readJson<Workout>(wkKey(userId));
      const setsStore = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const newWorkouts: Workout[] = [];
      const newSets: (LoggedSetRow & { date: string })[] = [];
      for (const s of schedule) {
        const id = randomId();
        newWorkouts.push({ id, userId, name: s.name, status: 'planned', plannedFor: s.plannedFor, notes: s.notes, createdAt: now, updatedAt: now });
        for (const set of s.sets ?? []) {
          newSets.push({ workoutId: id, exerciseId: set.exerciseId, order: set.order, reps: set.reps, weightKg: null, date: now });
        }
      }
      await writeJson(wkKey(userId), [...newWorkouts, ...workouts]);
      if (newSets.length > 0) await writeJson(setKey(userId), [...newSets, ...setsStore]);
    },
    async listUserSessions(userId) {
      const all = await readJson<UserSession>(usKey());
      return all.filter((s) => s.userId === userId);
    },
    async listCommunitySessions(userId) {
      const all = await readJson<UserSession>(usKey());
      return all.filter((s) => s.visibility === 'public' && s.userId !== userId);
    },
    async getSessionExercises(sessionId) {
      return readJson<UserSessionExercise>(usExKey(sessionId));
    },
    async addUserSession(userId, input) {
      const all = await readJson<UserSession>(usKey());
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const now = new Date().toISOString();
      const session: UserSession = {
        id: randomId(),
        userId,
        name: input.name,
        notes: input.notes,
        visibility: input.visibility,
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [session, ...all]);
      const exercises: UserSessionExercise[] = input.exercises.map((e, i) => ({
        id: randomId(),
        sessionId: session.id,
        exerciseId: e.exerciseId,
        order: e.order ?? i,
        reps: e.reps,
        weightKg: e.weightKg,
        durationSec: e.durationSec,
        restSec: e.restSec,
      }));
      await writeJson(usExKey(session.id), exercises);
      return session;
    },
    async setSessionVisibility(_userId, sessionId, visibility) {
      const all = await readJson<UserSession>(usKey());
      await writeJson(
        usKey(),
        all.map((s) => (s.id === sessionId ? { ...s, visibility, updatedAt: new Date().toISOString() } : s)),
      );
    },
    async deleteUserSession(_userId, sessionId) {
      const all = await readJson<UserSession>(usKey());
      await writeJson(usKey(), all.filter((s) => s.id !== sessionId));
    },
    async copySession(userId, sourceSessionId) {
      const all = await readJson<UserSession>(usKey());
      const source = all.find((s) => s.id === sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      if (all.filter((s) => s.userId === userId).length >= SESSIONS_QUOTA) {
        throw new Error(`Limite de ${SESSIONS_QUOTA} séances atteinte.`);
      }
      const exercises = await readJson<UserSessionExercise>(usExKey(sourceSessionId));
      const now = new Date().toISOString();
      const copy: UserSession = {
        id: randomId(),
        userId,
        name: source.name,
        notes: source.notes,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(usKey(), [copy, ...all]);
      await writeJson(
        usExKey(copy.id),
        exercises.map((e) => ({ ...e, id: randomId(), sessionId: copy.id })),
      );
      return copy;
    },
    async listUserPrograms(userId) {
      const all = await readJson<UserProgram>(upKey());
      return all.filter((p) => p.userId === userId);
    },
    async listCommunityPrograms(userId) {
      const all = await readJson<UserProgram>(upKey());
      return all.filter((p) => p.visibility === 'public' && p.userId !== userId);
    },
    async getProgramSessions(programId) {
      return readJson<UserProgramSession>(upsKey(programId));
    },
    async addUserProgram(userId, input) {
      const all = await readJson<UserProgram>(upKey());
      if (all.filter((p) => p.userId === userId).length >= PROGRAMS_QUOTA) {
        throw new Error(`Limite de ${PROGRAMS_QUOTA} programmes atteinte.`);
      }
      const now = new Date().toISOString();
      const program: UserProgram = {
        id: randomId(),
        userId,
        title: input.title,
        focus: input.focus,
        level: input.level,
        weeks: input.weeks,
        description: input.description,
        visibility: input.visibility,
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(upKey(), [program, ...all]);
      return program;
    },
    async setProgramVisibility(_userId, programId, visibility) {
      const all = await readJson<UserProgram>(upKey());
      await writeJson(
        upKey(),
        all.map((p) => (p.id === programId ? { ...p, visibility, updatedAt: new Date().toISOString() } : p)),
      );
    },
    async deleteUserProgram(_userId, programId) {
      const all = await readJson<UserProgram>(upKey());
      await writeJson(upKey(), all.filter((p) => p.id !== programId));
    },
    async assignProgramSession(_userId, programId, slot) {
      const existing = await readJson<UserProgramSession>(upsKey(programId));
      const created: UserProgramSession = {
        id: randomId(),
        programId,
        sessionId: slot.sessionId,
        weekNumber: slot.weekNumber,
        dayIndex: slot.dayIndex,
        order: slot.order ?? existing.length,
      };
      await writeJson(upsKey(programId), [...existing, created]);
      return created;
    },
    async removeProgramSession(_userId, programSessionId) {
      // Slots are keyed by program id in storage but addressed by their own id
      // here — scan every program's slot list (demo mode has at most a
      // handful, so this stays cheap).
      const programs = await readJson<UserProgram>(upKey());
      for (const p of programs) {
        const slots = await readJson<UserProgramSession>(upsKey(p.id));
        if (slots.some((s) => s.id === programSessionId)) {
          await writeJson(upsKey(p.id), slots.filter((s) => s.id !== programSessionId));
          return;
        }
      }
    },
    async copyProgram(userId, sourceProgramId) {
      const programs = await readJson<UserProgram>(upKey());
      const source = programs.find((p) => p.id === sourceProgramId);
      if (!source) throw new Error('Programme introuvable.');
      if (programs.filter((p) => p.userId === userId).length >= PROGRAMS_QUOTA) {
        throw new Error(`Limite de ${PROGRAMS_QUOTA} programmes atteinte.`);
      }

      const slots = await readJson<UserProgramSession>(upsKey(sourceProgramId));
      const distinctSessionIds = [...new Set(slots.map((s) => s.sessionId))];
      const allSessions = await readJson<UserSession>(usKey());
      const mine = allSessions.filter((s) => s.userId === userId).length;
      if (mine + distinctSessionIds.length > SESSIONS_QUOTA) {
        throw new Error(
          `Il te reste ${Math.max(0, SESSIONS_QUOTA - mine)} séance(s) de libre, ce programme en a besoin de ${distinctSessionIds.length}.`,
        );
      }

      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      const newSessions: UserSession[] = [];
      for (const sid of distinctSessionIds) {
        const src = allSessions.find((s) => s.id === sid);
        if (!src) continue;
        const newId = randomId();
        idMap.set(sid, newId);
        newSessions.push({ ...src, id: newId, userId, visibility: 'private', createdAt: now, updatedAt: now });
        const exercises = await readJson<UserSessionExercise>(usExKey(sid));
        await writeJson(usExKey(newId), exercises.map((e) => ({ ...e, id: randomId(), sessionId: newId })));
      }
      await writeJson(usKey(), [...newSessions, ...allSessions]);

      const newProgram: UserProgram = {
        ...source,
        id: randomId(),
        userId,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(upKey(), [newProgram, ...programs]);

      const newSlots: UserProgramSession[] = slots
        .filter((s) => idMap.has(s.sessionId))
        .map((s) => ({
          id: randomId(),
          programId: newProgram.id,
          sessionId: idMap.get(s.sessionId)!,
          weekNumber: s.weekNumber,
          dayIndex: s.dayIndex,
          order: s.order,
        }));
      await writeJson(upsKey(newProgram.id), newSlots);

      return newProgram;
    },
    async persistImport(userId, payload) {
      const existingA = await readJson<Activity>(actKey(userId));
      // Dedup by (start time + source): re-importing an export adds nothing.
      const seenA = new Set(existingA.map((a) => `${a.source}|${a.startedAt}`));
      const newA = payload.activities
        .map((a) => importedToActivity(userId, a))
        .filter((a) => {
          const key = `${a.source}|${a.startedAt}`;
          if (seenA.has(key)) return false;
          seenA.add(key);
          return true;
        });
      await writeJson(actKey(userId), [...newA, ...existingA]);

      const existingH = await readJson<HealthMetric>(hmKey(userId));
      const seen = new Set(existingH.map((h) => `${h.type}|${h.measuredAt}`));
      const newH = payload.healthMetrics
        .map((m) => importedToHealth(userId, m))
        .filter((h) => !seen.has(`${h.type}|${h.measuredAt}`));
      await writeJson(hmKey(userId), [...newH, ...existingH]);

      const existingR = await readJson<PersonalRecord>(recKey(userId));
      const seenR = new Set(existingR.map((r) => `${r.source}|${r.externalId ?? r.label + r.achievedAt}`));
      const newR = payload.records
        .map((r) => importedToRecord(userId, r))
        .filter((r) => {
          const key = `${r.source}|${r.externalId ?? r.label + r.achievedAt}`;
          if (seenR.has(key)) return false;
          seenR.add(key);
          return true;
        });
      await writeJson(recKey(userId), [...newR, ...existingR]);

      // Re-syncing the same night from the same source (e.g. after a parser
      // fix like adding hypnogram segments) should refresh it, not silently
      // no-op forever — upsert by (source, startedAt) instead of skipping.
      const existingS = await readJson<SleepSession>(sleepKey(userId));
      const byKeyS = new Map(existingS.map((s) => [`${s.source}|${s.startedAt}`, s]));
      for (const s of payload.sleepSessions) {
        const mapped = importedToSleepSession(userId, s);
        byKeyS.set(`${mapped.source}|${mapped.startedAt}`, mapped);
      }
      await writeJson(sleepKey(userId), [...byKeyS.values()]);

      const importedIdsKey = `supotsu.importedWorkoutIds.${userId}`;
      const importedIds = new Set(await readJson<string>(importedIdsKey));
      const newWorkouts = payload.workouts.filter((w) => !importedIds.has(w.externalId));
      if (newWorkouts.length > 0) {
        const existingWk = await readJson<Workout>(wkKey(userId));
        const existingSets = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
        const createdWk: Workout[] = [];
        const createdSets: (LoggedSetRow & { date: string })[] = [];
        for (const w of newWorkouts) {
          const workout: Workout = {
            id: randomId(),
            userId,
            name: 'Musculation (import Garmin)',
            status: 'completed',
            completedAt: w.startedAt,
            createdAt: w.startedAt,
            updatedAt: w.startedAt,
          };
          createdWk.push(workout);
          w.sets.forEach((s, i) => {
            createdSets.push({
              workoutId: workout.id,
              exerciseId: s.exerciseId,
              order: i,
              reps: s.reps ?? null,
              weightKg: s.weightKg ?? null,
              date: w.startedAt,
            });
          });
          importedIds.add(w.externalId);
        }
        await writeJson(wkKey(userId), [...createdWk, ...existingWk]);
        await writeJson(setKey(userId), [...createdSets, ...existingSets]);
        await writeJson(importedIdsKey, [...importedIds]);
      }

      return { activities: newA.length, health: newH.length, sleep: payload.sleepSessions.length, workouts: newWorkouts.length };
    },
  };
}

// --- supabase implementation ----------------------------------------------
function createSupabaseRepository(
  client: NonNullable<ReturnType<typeof getSupabase>>,
): DataRepository {
  return {
    async listActivities(userId) {
      return (await listActivitiesDb(client, userId)).map(rowToActivity);
    },
    async addActivity(userId, input) {
      const row = await insertActivity(client, {
        user_id: userId,
        type: input.type,
        source: input.source,
        started_at: input.startedAt,
        duration_sec: input.durationSec,
        distance_m: input.distanceM ?? null,
        calories: input.calories ?? null,
        intensity: input.intensity ?? null,
        avg_heart_rate: input.avgHeartRate ?? null,
        notes: input.notes ?? null,
      });
      return rowToActivity(row);
    },
    async updateActivityMuscles(_userId, activityId, muscles) {
      return rowToActivity(await updateActivityMusclesDb(client, activityId, muscles));
    },
    async deleteActivity(_userId, activityId) {
      await deleteActivityDb(client, activityId);
    },
    async listWorkouts(userId) {
      return (await listWorkoutsDb(client, userId)).map(rowToWorkout);
    },
    async listHealthMetrics(userId) {
      return (await listHealthMetricsDb(client, userId)).map(rowToHealthMetric);
    },
    async addHealthMetric(userId, input) {
      const measuredAt = input.measuredAt ?? new Date().toISOString();
      await insertHealthMetrics(client, [
        {
          user_id: userId,
          type: input.type,
          value: input.value,
          unit: input.unit,
          source: 'manual',
          measured_at: measuredAt,
        },
      ]);
      const now = new Date().toISOString();
      return { id: randomId(), userId, type: input.type, value: input.value, unit: input.unit, source: 'manual', measuredAt, createdAt: now, updatedAt: now };
    },
    async deleteHealthMetric(_userId, metricId) {
      await deleteHealthMetricDb(client, metricId);
    },
    async listSleepSessions(userId) {
      return (await listSleepSessionsDb(client, userId)).map(rowToSleepSession);
    },
    async addSleepSession(userId, session) {
      const existing = (await listSleepSessionsDb(client, userId)).map(rowToSleepSession);
      const sameNight = existing.filter((s) => nightDateKey(s.endedAt) === nightDateKey(session.endedAt));
      const action = resolveSleepSessionInsert(sameNight, session.reliability ?? 'high');
      if (action === 'skip') {
        const rank = { low: 0, medium: 1, high: 2 } as const;
        const winner = [...sameNight].sort((a, b) => rank[b.reliability ?? 'high'] - rank[a.reliability ?? 'high'])[0]!;
        return { session: winner, inserted: false };
      }
      const row = await insertSleepSession(client, {
        user_id: userId,
        source: session.source,
        reliability: session.reliability ?? null,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        deep_min: session.deepMin,
        light_min: session.lightMin,
        rem_min: session.remMin,
        awake_min: session.awakeMin,
        asleep_min: session.asleepMin,
        in_bed_min: session.inBedMin,
        segments: (session.segments ?? null) as unknown as SleepSessionRow['segments'],
      });
      const metrics = sleepSessionMetrics(session);
      if (metrics.length > 0) {
        await insertHealthMetrics(
          client,
          metrics.map((m) => ({ user_id: userId, type: m.type, value: m.value, unit: m.unit, source: m.source, reliability: m.reliability ?? null, measured_at: m.measuredAt })),
        );
      }
      return { session: rowToSleepSession(row), inserted: true };
    },
    async listRecords(userId) {
      return (await listRecordsDb(client, userId)).map(rowToRecord);
    },
    async listMuscleSessions(userId) {
      const workoutRows = await listWorkoutsDb(client, userId);
      const dates = new Map(workoutRows.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listWorkoutSetsForUser(client, userId);
      const activities = (await listActivitiesDb(client, userId)).map(rowToActivity);
      const workouts = workoutRows.map(rowToWorkout);
      return [...buildMuscleSessions(dates, sets), ...buildActivityMuscleSessions(activities, workouts)];
    },
    async listMuscleWork(userId) {
      const workouts = await listWorkoutsDb(client, userId);
      const dates = new Map(workouts.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listLoggedSetsDb(client, userId);
      return buildMuscleWork(dates, sets);
    },
    async lastSessionSetsByExercise(userId) {
      const workouts = await listWorkoutsDb(client, userId);
      const dates = new Map(workouts.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listLoggedSetsDb(client, userId);
      return lastSessionByExercise(dates, sets);
    },
    async listWellnessCheckins(userId) {
      return (await listWellnessCheckinsDb(client, userId)).map(rowToWellness);
    },
    async addWellnessCheckin(userId, input) {
      const row = await insertWellnessCheckin(client, {
        user_id: userId,
        mood: input.mood,
        energy: input.energy,
        stress: input.stress,
        note: input.note ?? null,
      });
      return rowToWellness(row);
    },
    async listGoals(userId) {
      return (await listGoalsDb(client, userId)).map(rowToGoal);
    },
    async addGoal(userId, input) {
      const row = await insertGoal(client, {
        user_id: userId,
        type: input.type,
        title: input.title,
        description: input.description,
        priority: input.priority,
        target_value: input.targetValue,
        target_unit: input.targetUnit,
        start_value: input.currentValue,
        current_value: input.currentValue,
      });
      return rowToGoal(row);
    },
    async updateGoalCurrent(userId, goalId, currentValue) {
      const current = (await listGoalsDb(client, userId)).map(rowToGoal).find((g) => g.id === goalId);
      if (!current) throw new Error('Objectif introuvable.');
      const { progress, status } = progressedGoal(current, currentValue);
      return rowToGoal(await updateGoalCurrent(client, goalId, currentValue, progress, status));
    },
    async updateGoal(_userId, goalId, patch) {
      return rowToGoal(
        await updateGoalDb(client, goalId, {
          title: patch.title,
          type: patch.type,
          target_value: patch.targetValue ?? null,
          target_unit: patch.targetUnit ?? null,
          deadline: patch.deadline ?? null,
        }),
      );
    },
    async deleteGoal(_userId, goalId) {
      await deleteGoalDb(client, goalId);
    },
    async getAthleteProfile(userId) {
      const row = await getAthleteProfileDb(client, userId);
      if (!row) return null;
      return {
        sex: row.sex,
        heightCm: row.height_cm ?? undefined,
        weightKg: row.weight_kg ?? undefined,
        level: row.level,
        sports: row.sports ?? [],
        weeklyAvailability: row.weekly_availability ?? undefined,
        equipment: row.equipment ?? [],
        birthDate: row.birth_date ?? undefined,
      };
    },
    async saveAthleteProfile(userId, input) {
      await upsertAthleteProfile(client, {
        user_id: userId,
        sex: input.sex,
        height_cm: input.heightCm ?? null,
        weight_kg: input.weightKg ?? null,
        level: input.level,
        sports: input.sports,
        weekly_availability: input.weeklyAvailability ?? null,
        equipment: input.equipment,
        birth_date: input.birthDate ?? null,
      });
    },
    async listNutritionEntries(userId) {
      return (await listNutritionEntriesDb(client, userId)).map(rowToNutrition);
    },
    async addNutritionEntry(userId, input) {
      const row = await insertNutritionEntry(client, {
        user_id: userId,
        meal_type: input.mealType,
        description: input.description,
        kcal: input.kcal,
        protein_g: input.proteinG ?? null,
        carb_g: input.carbG ?? null,
        fat_g: input.fatG ?? null,
        hydration_ml: input.hydrationMl ?? null,
        source: input.source,
        logged_at: input.loggedAt,
      });
      return rowToNutrition(row);
    },
    async deleteNutritionEntry(_userId, entryId) {
      await deleteNutritionEntryDb(client, entryId);
    },
    async updateNutritionEntry(_userId, entryId, patch) {
      const row = await updateNutritionEntryDb(client, entryId, {
        kcal: patch.kcal,
        protein_g: patch.proteinG ?? null,
        carb_g: patch.carbG ?? null,
        fat_g: patch.fatG ?? null,
      });
      return rowToNutrition(row);
    },
    async listHabits(userId) {
      return (await listHabitsDb(client, userId)).map(rowToHabit);
    },
    async addHabit(userId, input) {
      const row = await insertHabit(client, {
        user_id: userId,
        name: input.name,
        pillar: input.pillar,
        cadence: input.cadence,
        target_per_period: input.targetPerPeriod,
      });
      return rowToHabit(row);
    },
    async updateHabit(_userId, habitId, patch) {
      return rowToHabit(
        await updateHabitDb(client, habitId, {
          name: patch.name,
          pillar: patch.pillar,
          cadence: patch.cadence,
          target_per_period: patch.targetPerPeriod,
        }),
      );
    },
    async archiveHabit(_userId, habitId) {
      await archiveHabitDb(client, habitId);
    },
    async listCustomExercises(userId) {
      return (await listCustomExercisesDb(client, userId)).map(rowToExercise);
    },
    async addCustomExercise(userId, input) {
      const row = await insertCustomExerciseDb(client, {
        id: `custom-${randomId()}`,
        name: input.name,
        category: 'strength',
        primary_muscles: [input.primaryMuscle],
        secondary_muscles: input.secondaryMuscles,
        equipment: input.equipment ? [input.equipment] : [],
        created_by: userId,
      });
      return rowToExercise(row);
    },
    async listHabitLogs(userId) {
      return (await listHabitLogsDb(client, userId)).map(rowToHabitLog);
    },
    async logHabit(userId, habitId) {
      const row = await insertHabitLog(client, userId, habitId, new Date().toISOString());
      return rowToHabitLog(row);
    },
    async deleteHabitLog(_userId, logId) {
      await deleteHabitLogDb(client, logId);
    },
    async listChallenges() {
      return (await listChallengesDb(client)).map(rowToChallenge);
    },
    async createChallenge(userId, input) {
      const row = await insertChallenge(client, {
        user_id: userId,
        title: input.title,
        description: input.description ?? null,
        metric: input.metric,
        target: input.target,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        visibility: input.visibility,
      });
      // Auto-join your own challenge.
      await joinChallengeDb(client, userId, row.id);
      return rowToChallenge(row);
    },
    async listMyChallengeIds(userId) {
      return (await listMyParticipations(client, userId)).map((p) => p.challenge_id);
    },
    async joinChallenge(userId, challengeId) {
      await joinChallengeDb(client, userId, challengeId);
    },
    async challengeLeaderboard(challenge) {
      const rows = await fetchLeaderboard(client, challenge.id);
      return rows.map((r) => ({ userId: r.user_id, progress: r.progress }));
    },
    async getLeaderboardPrefs(userId) {
      const row = await getProfileDb(client, userId);
      return { displayName: row?.display_name ?? null, leaderboardOptIn: row?.leaderboard_opt_in ?? false };
    },
    async updateLeaderboardPrefs(userId, patch) {
      await updateLeaderboardPrefsDb(client, userId, {
        display_name: patch.displayName,
        leaderboard_opt_in: patch.leaderboardOptIn,
      });
    },
    async recordDailyScore(userId, column, value) {
      await upsertDailyScoreDb(client, userId, column, value);
    },
    async getLeaderboard(_userId, category, days) {
      const rows = await fetchGeneralLeaderboardDb(client, category, days);
      return rows.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name ?? 'Athlète',
        avatarUrl: r.avatar_url ?? undefined,
        avgScore: Math.round(r.avg_score),
        rank: r.rank,
      }));
    },
    async listPrograms() {
      return (await listProgramsDb(client)).map(rowToProgram);
    },
    async listEnrolledProgramIds(userId) {
      return (await listEnrollmentsDb(client, userId)).map((e) => e.program_id);
    },
    async enrollProgram(userId, programId) {
      const existing = await listEnrollmentsDb(client, userId);
      const alreadyEnrolled = existing.some((e) => e.program_id === programId);
      await enrollInProgram(client, userId, programId);
      if (alreadyEnrolled) return; // don't regenerate the schedule on a re-enroll

      const program = PROGRAM_CATALOG.find((p) => p.id === programId);
      if (!program) return;
      const schedule = generateProgramSchedule(program);
      for (const s of schedule) {
        await insertWorkout(
          client,
          { user_id: userId, name: s.name, status: 'planned', planned_for: s.plannedFor, notes: s.notes ?? null },
          (s.sets ?? []).map((set) => ({ exercise_id: set.exerciseId, order: set.order, reps: set.reps, weight_kg: null })),
        );
      }
    },
    async listUserSessions(userId) {
      return (await listUserSessionsDb(client, userId)).map(rowToUserSession);
    },
    async listCommunitySessions(userId) {
      return (await listCommunitySessionsDb(client, userId)).map(rowToUserSession);
    },
    async getSessionExercises(sessionId) {
      return (await listSessionExercisesDb(client, sessionId)).map(rowToUserSessionExercise);
    },
    async addUserSession(userId, input) {
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: input.name, notes: input.notes ?? null, visibility: input.visibility },
        input.exercises.map((e, i) => ({
          exercise_id: e.exerciseId,
          order: e.order ?? i,
          reps: e.reps ?? null,
          weight_kg: e.weightKg ?? null,
          duration_sec: e.durationSec ?? null,
          rest_sec: e.restSec ?? null,
        })),
      );
      return rowToUserSession(row);
    },
    async setSessionVisibility(_userId, sessionId, visibility) {
      await updateUserSessionVisibilityDb(client, sessionId, visibility);
    },
    async deleteUserSession(_userId, sessionId) {
      await deleteUserSessionDb(client, sessionId);
    },
    async copySession(userId, sourceSessionId) {
      const source = await getUserSessionDb(client, sourceSessionId);
      if (!source) throw new Error('Séance introuvable.');
      const exercises = await listSessionExercisesDb(client, sourceSessionId);
      const row = await insertUserSessionDb(
        client,
        { user_id: userId, name: source.name, notes: source.notes, visibility: 'private' },
        exercises.map((e) => ({
          exercise_id: e.exercise_id,
          order: e.order,
          reps: e.reps,
          weight_kg: e.weight_kg,
          duration_sec: e.duration_sec,
          rest_sec: e.rest_sec,
        })),
      );
      return rowToUserSession(row);
    },
    async listUserPrograms(userId) {
      return (await listUserProgramsDb(client, userId)).map(rowToUserProgram);
    },
    async listCommunityPrograms(userId) {
      return (await listCommunityProgramsDb(client, userId)).map(rowToUserProgram);
    },
    async getProgramSessions(programId) {
      return (await listProgramSessionsDb(client, programId)).map(rowToUserProgramSession);
    },
    async addUserProgram(userId, input) {
      const row = await insertUserProgramDb(client, {
        user_id: userId,
        title: input.title,
        focus: input.focus,
        level: input.level,
        weeks: input.weeks,
        description: input.description ?? null,
        visibility: input.visibility,
      });
      return rowToUserProgram(row);
    },
    async setProgramVisibility(_userId, programId, visibility) {
      await updateUserProgramVisibilityDb(client, programId, visibility);
    },
    async deleteUserProgram(_userId, programId) {
      await deleteUserProgramDb(client, programId);
    },
    async assignProgramSession(_userId, programId, slot) {
      const row = await insertProgramSessionDb(client, {
        program_id: programId,
        session_id: slot.sessionId,
        week_number: slot.weekNumber,
        day_index: slot.dayIndex,
        order: slot.order ?? 0,
      });
      return rowToUserProgramSession(row);
    },
    async removeProgramSession(_userId, programSessionId) {
      await deleteProgramSessionDb(client, programSessionId);
    },
    async copyProgram(userId, sourceProgramId) {
      const source = await getUserProgramDb(client, sourceProgramId);
      if (!source) throw new Error('Programme introuvable.');

      const [myPrograms, mySessions, slots] = await Promise.all([
        listUserProgramsDb(client, userId),
        listUserSessionsDb(client, userId),
        listProgramSessionsDb(client, sourceProgramId),
      ]);
      if (myPrograms.length >= 2) throw new Error('Limite de 2 programmes atteinte.');
      const distinctSessionIds = [...new Set(slots.map((s) => s.session_id))];
      if (mySessions.length + distinctSessionIds.length > 50) {
        throw new Error(
          `Il te reste ${Math.max(0, 50 - mySessions.length)} séance(s) de libre, ce programme en a besoin de ${distinctSessionIds.length}.`,
        );
      }

      const idMap = new Map<string, string>();
      for (const sid of distinctSessionIds) {
        const src = await getUserSessionDb(client, sid);
        if (!src) continue;
        const exercises = await listSessionExercisesDb(client, sid);
        const newSession = await insertUserSessionDb(
          client,
          { user_id: userId, name: src.name, notes: src.notes, visibility: 'private' },
          exercises.map((e) => ({
            exercise_id: e.exercise_id,
            order: e.order,
            reps: e.reps,
            weight_kg: e.weight_kg,
            duration_sec: e.duration_sec,
            rest_sec: e.rest_sec,
          })),
        );
        idMap.set(sid, newSession.id);
      }

      const newProgramRow = await insertUserProgramDb(client, {
        user_id: userId,
        title: source.title,
        focus: source.focus,
        level: source.level,
        weeks: source.weeks,
        description: source.description,
        visibility: 'private',
      });

      for (const s of slots) {
        const newSessionId = idMap.get(s.session_id);
        if (!newSessionId) continue;
        await insertProgramSessionDb(client, {
          program_id: newProgramRow.id,
          session_id: newSessionId,
          week_number: s.week_number,
          day_index: s.day_index,
          order: s.order,
        });
      }

      return rowToUserProgram(newProgramRow);
    },
    async persistImport(userId, payload) {
      await upsertActivities(
        client,
        payload.activities.map((a) => ({
          user_id: userId,
          external_id: a.externalId ?? null,
          type: a.type,
          source: a.source,
          started_at: a.startedAt,
          duration_sec: a.durationSec,
          distance_m: a.distanceM ?? null,
          calories: a.calories ?? null,
          intensity: a.intensity ?? null,
          avg_heart_rate: a.avgHeartRate ?? null,
          notes: a.notes ?? null,
        })),
      );
      await insertHealthMetrics(
        client,
        payload.healthMetrics.map((m) => ({
          user_id: userId,
          type: m.type,
          value: m.value,
          unit: m.unit,
          source: m.source,
          reliability: m.reliability ?? null,
          measured_at: m.measuredAt,
        })),
      );
      await upsertRecords(
        client,
        payload.records.map((r) => ({
          user_id: userId,
          external_id: r.externalId ?? null,
          label: r.label,
          category: r.category,
          value: r.value,
          unit: r.unit,
          source: r.source,
          achieved_at: r.achievedAt,
        })),
      );
      await insertSleepSessions(
        client,
        payload.sleepSessions.map((s) => ({
          user_id: userId,
          source: s.source,
          reliability: s.reliability ?? null,
          started_at: s.startedAt,
          ended_at: s.endedAt,
          deep_min: s.deepMin,
          light_min: s.lightMin,
          rem_min: s.remMin,
          awake_min: s.awakeMin,
          asleep_min: s.asleepMin,
          in_bed_min: s.inBedMin,
          segments: (s.segments ?? null) as unknown as SleepSessionRow['segments'],
        })),
      );
      const setsByExternalId = new Map(
        payload.workouts.map((w) => [
          w.externalId,
          w.sets.map((s, i) => ({
            exercise_id: s.exerciseId,
            order: i,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
          })),
        ]),
      );
      const workoutsAdded = await upsertImportedWorkouts(
        client,
        payload.workouts.map((w) => ({
          user_id: userId,
          external_id: w.externalId,
          name: 'Musculation (import Garmin)',
          status: 'completed' as const,
          completed_at: w.startedAt,
        })),
        setsByExternalId,
      );
      return {
        activities: payload.activities.length,
        health: payload.healthMetrics.length,
        sleep: payload.sleepSessions.length,
        workouts: workoutsAdded,
      };
    },
    async addWorkout(userId, workout) {
      const row = await insertWorkout(
        client,
        {
          user_id: userId,
          name: workout.name,
          status: 'planned',
          planned_for: todayKey(),
        },
        workout.sets.map((s) => ({
          exercise_id: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weight_kg: s.weightKg ?? null,
          rest_sec: s.restSec ?? null,
          rpe: s.rpe ?? null,
        })),
      );
      return rowToWorkout(row);
    },
    async listPlannedWorkouts(userId) {
      return (await listPlannedWorkoutsDb(client, userId)).map(rowToWorkout);
    },
    async addPlannedWorkout(userId, input) {
      const row = input.sets && input.sets.length > 0
        ? await insertWorkout(
            client,
            {
              user_id: userId,
              name: input.name,
              status: 'planned',
              planned_for: input.plannedFor,
              notes: input.notes ?? null,
            },
            input.sets.map((s) => ({
              exercise_id: s.exerciseId,
              order: s.order,
              reps: s.reps ?? null,
              weight_kg: s.weightKg ?? null,
              rest_sec: s.restSec ?? null,
              rpe: s.rpe ?? null,
            })),
          )
        : await insertPlannedWorkout(client, {
            user_id: userId,
            name: input.name,
            planned_for: input.plannedFor,
            notes: input.notes ?? null,
          });
      return rowToWorkout(row);
    },
    async setWorkoutStatus(_userId, workoutId, status, completedAt) {
      const row = await updateWorkoutStatusDb(client, workoutId, status, completedAt);
      return rowToWorkout(row);
    },
    async deletePlannedWorkout(_userId, workoutId) {
      await deleteWorkoutDb(client, workoutId);
    },
    async getWorkoutSets(_userId, workoutId) {
      const rows = await listSetsForWorkout(client, workoutId);
      return rows.map((r) => ({
        id: r.id,
        workoutId: r.workout_id,
        blockId: r.block_id ?? undefined,
        exerciseId: r.exercise_id,
        order: r.order,
        reps: r.reps ?? undefined,
        weightKg: r.weight_kg ?? undefined,
        durationSec: r.duration_sec ?? undefined,
        restSec: r.rest_sec ?? undefined,
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
      }));
    },
    async addCircuitWorkout(userId, workout) {
      const row = await insertWorkoutWithBlocksDb(
        client,
        { user_id: userId, name: workout.name, status: 'planned' },
        workout.blocks.map((b) => ({
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
          sets: b.sets.map((s) => ({
            exercise_id: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
            duration_sec: s.durationSec ?? null,
            rest_sec: s.restSec ?? null,
            superset_group: s.supersetGroup ?? null,
          })),
        })),
      );
      return rowToWorkout(row);
    },
    async getWorkoutBlocks(_userId, workoutId) {
      return (await listBlocksForWorkoutDb(client, workoutId)).map(rowToWorkoutBlock);
    },
    async getBlockSets(_userId, blockId) {
      const rows = await listSetsForBlockDb(client, blockId);
      return rows.map((r) => ({
        id: r.id,
        workoutId: r.workout_id,
        blockId: r.block_id ?? undefined,
        exerciseId: r.exercise_id,
        order: r.order,
        reps: r.reps ?? undefined,
        weightKg: r.weight_kg ?? undefined,
        durationSec: r.duration_sec ?? undefined,
        restSec: r.rest_sec ?? undefined,
        rpe: r.rpe ?? undefined,
        supersetGroup: r.superset_group ?? undefined,
      }));
    },
    async completeBlock(_userId, blockId, result) {
      return rowToWorkoutBlock(await updateBlockResultDb(client, blockId, result));
    },
    async editWorkout(_userId, workoutId, patch) {
      await updateWorkoutDb(client, workoutId, { name: patch.name, notes: patch.notes ?? null });
      await replaceWorkoutSetsDb(
        client,
        workoutId,
        patch.sets.map((s) => ({ exercise_id: s.exerciseId, order: s.order, reps: s.reps ?? null, weight_kg: s.weightKg ?? null, rest_sec: s.restSec ?? null })),
      );
    },
    async editCircuitWorkout(_userId, workoutId, patch) {
      await updateWorkoutDb(client, workoutId, { name: patch.name, notes: patch.notes ?? null });
      await replaceWorkoutBlocksDb(
        client,
        workoutId,
        patch.blocks.map((b) => ({
          format: b.format,
          timeCapSec: b.timeCapSec,
          targetRounds: b.targetRounds,
          sets: b.sets.map((s) => ({
            exercise_id: s.exerciseId,
            order: s.order,
            reps: s.reps ?? null,
            weight_kg: s.weightKg ?? null,
            duration_sec: s.durationSec ?? null,
            rest_sec: s.restSec ?? null,
            superset_group: s.supersetGroup ?? null,
          })),
        })),
      );
    },
  };
}

export function createDataRepository(): DataRepository {
  const client = getSupabase();
  return client ? createSupabaseRepository(client) : createDemoRepository();
}

/** Gather all of a user's data into a plain object (RGPD export, Master Prompt P15). */
export async function exportUserData(
  repo: DataRepository,
  userId: string,
): Promise<Record<string, unknown>> {
  const [activities, workouts, health, records, nutrition, habits, habitLogs, goals, wellness, profile] =
    await Promise.all([
      repo.listActivities(userId),
      repo.listWorkouts(userId),
      repo.listHealthMetrics(userId),
      repo.listRecords(userId),
      repo.listNutritionEntries(userId),
      repo.listHabits(userId),
      repo.listHabitLogs(userId),
      repo.listGoals(userId),
      repo.listWellnessCheckins(userId),
      repo.getAthleteProfile(userId),
    ]);
  return {
    exportedAt: new Date().toISOString(),
    app: 'SUPOTSU',
    profile,
    activities,
    workouts,
    healthMetrics: health,
    records,
    nutrition,
    habits,
    habitLogs,
    goals,
    wellnessCheckins: wellness,
  };
}
