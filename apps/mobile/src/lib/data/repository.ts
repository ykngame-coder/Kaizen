import type {
  Activity,
  Challenge,
  Goal,
  HealthMetric,
  Habit,
  HabitLog,
  MuscleGroup,
  NutritionEntry,
  PersonalRecord,
  Program,
  Workout,
  SetEntry,
  SleepSession,
  WellnessCheckin,
} from '@supotsu/core';
import type {
  ActivityInput,
  AthleteProfileInput,
  ChallengeInput,
  GoalInput,
  HabitInput,
  NutritionEntryInput,
  WellnessCheckinInput,
} from '@supotsu/shared';
import { computeGoalProgress } from '@supotsu/engines';
import { PROGRAM_CATALOG } from '@supotsu/shared';
import type {
  ImportedActivity,
  ImportedHealthMetric,
  ImportedRecord,
  ImportedSleepSession,
} from '@supotsu/connectors';
import type { MuscleSession } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import {
  insertActivity,
  upsertActivities,
  listActivities as listActivitiesDb,
  insertWorkout,
  insertPlannedWorkout,
  listPlannedWorkouts as listPlannedWorkoutsDb,
  updateWorkoutStatus as updateWorkoutStatusDb,
  deleteWorkout as deleteWorkoutDb,
  listWorkouts as listWorkoutsDb,
  listWorkoutSetsForUser,
  listLoggedSets as listLoggedSetsDb,
  insertHealthMetrics,
  listHealthMetrics as listHealthMetricsDb,
  insertSleepSessions,
  listSleepSessions as listSleepSessionsDb,
  insertNutritionEntry,
  listNutritionEntries as listNutritionEntriesDb,
  insertHabit,
  listHabits as listHabitsDb,
  insertHabitLog,
  listHabitLogs as listHabitLogsDb,
  insertChallenge,
  listChallenges as listChallengesDb,
  listMyParticipations,
  joinChallenge as joinChallengeDb,
  fetchLeaderboard,
  listPrograms as listProgramsDb,
  listEnrollments as listEnrollmentsDb,
  enrollInProgram,
  upsertRecords,
  listRecords as listRecordsDb,
  insertWellnessCheckin,
  listWellnessCheckins as listWellnessCheckinsDb,
  insertGoal,
  listGoals as listGoalsDb,
  updateGoalCurrent,
  getAthleteProfile as getAthleteProfileDb,
  upsertAthleteProfile,
  type ActivityRow,
  type WorkoutRow,
  type HealthMetricRow,
  type SleepSessionRow,
  type NutritionEntryRow,
  type HabitRow,
  type HabitLogRow,
  type ChallengeRow,
  type ProgramRow,
  type RecordRow,
  type WellnessCheckinRow,
  type GoalRow,
} from '@supotsu/database';
import { getSupabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secure-storage';
import { randomId } from '@/lib/id';

export interface NewWorkout {
  name: string;
  sets: Omit<SetEntry, 'id' | 'workoutId'>[];
}

/** A future training session to schedule (no sets yet). */
export interface PlannedInput {
  name: string;
  /** ISO date (YYYY-MM-DD) the session is planned for. */
  plannedFor: string;
  notes?: string;
}

export interface ImportPayload {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  records: ImportedRecord[];
  sleepSessions: ImportedSleepSession[];
}

/**
 * Unified data access for activities & workouts. A real Supabase implementation
 * is used when configured; otherwise a local (SecureStore/localStorage) store
 * keeps the app fully functional in demo mode. UI never imports either directly.
 */
export interface DataRepository {
  listActivities(userId: string): Promise<Activity[]>;
  addActivity(userId: string, input: ActivityInput): Promise<Activity>;
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
  listHealthMetrics(userId: string): Promise<HealthMetric[]>;
  listSleepSessions(userId: string): Promise<SleepSession[]>;
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
  getAthleteProfile(userId: string): Promise<AthleteProfileInput | null>;
  saveAthleteProfile(userId: string, input: AthleteProfileInput): Promise<void>;
  listNutritionEntries(userId: string): Promise<NutritionEntry[]>;
  addNutritionEntry(userId: string, input: NutritionEntryInput): Promise<NutritionEntry>;
  listHabits(userId: string): Promise<Habit[]>;
  addHabit(userId: string, input: HabitInput): Promise<Habit>;
  listHabitLogs(userId: string): Promise<HabitLog[]>;
  logHabit(userId: string, habitId: string): Promise<HabitLog>;
  listChallenges(): Promise<Challenge[]>;
  createChallenge(userId: string, input: ChallengeInput): Promise<Challenge>;
  listMyChallengeIds(userId: string): Promise<string[]>;
  joinChallenge(userId: string, challengeId: string): Promise<void>;
  challengeLeaderboard(challenge: Challenge): Promise<{ userId: string; progress: number }[]>;
  listPrograms(): Promise<Program[]>;
  listEnrolledProgramIds(userId: string): Promise<string[]>;
  enrollProgram(userId: string, programId: string): Promise<void>;
  /** Persist a validated connector import; returns how many rows were added. */
  persistImport(
    userId: string,
    payload: ImportPayload,
  ): Promise<{ activities: number; health: number; sleep: number }>;
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

const EXERCISE_BY_ID = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

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
  exerciseId: string;
  order: number;
  reps: number | null;
  weightKg: number | null;
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
const hmKey = (u: string): string => `supotsu.health.${u}`;
const sleepKey = (u: string): string => `supotsu.sleep.${u}`;
const nutKey = (u: string): string => `supotsu.nutrition.${u}`;
const habKey = (u: string): string => `supotsu.habits.${u}`;
const hlogKey = (u: string): string => `supotsu.habitlogs.${u}`;
const recKey = (u: string): string => `supotsu.records.${u}`;
const wcKey = (u: string): string => `supotsu.wellness.${u}`;
const goalKey = (u: string): string => `supotsu.goals.${u}`;
const profKey = (u: string): string => `supotsu.athleteprofile.${u}`;
const chKey = (u: string): string => `supotsu.challenges.${u}`;
const chJoinKey = (u: string): string => `supotsu.challengejoins.${u}`;
const enrollKey = (u: string): string => `supotsu.enrollments.${u}`;

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
        status: 'completed',
        completedAt: now,
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
    async listHealthMetrics(userId) {
      const items = await readJson<HealthMetric>(hmKey(userId));
      return items.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    },
    async listSleepSessions(userId) {
      const items = await readJson<SleepSession>(sleepKey(userId));
      return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async listRecords(userId) {
      const items = await readJson<PersonalRecord>(recKey(userId));
      return items.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
    },
    async listMuscleSessions(userId) {
      const rows = await readJson<LoggedSetRow & { date: string }>(setKey(userId));
      const dates = new Map(rows.map((r) => [r.workoutId, r.date]));
      return buildMuscleSessions(dates, rows);
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
    async listPrograms() {
      return PROGRAM_CATALOG;
    },
    async listEnrolledProgramIds(userId) {
      return readJson<string>(enrollKey(userId));
    },
    async enrollProgram(userId, programId) {
      const ids = await readJson<string>(enrollKey(userId));
      if (!ids.includes(programId)) await writeJson(enrollKey(userId), [programId, ...ids]);
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

      const existingS = await readJson<SleepSession>(sleepKey(userId));
      const seenS = new Set(existingS.map((s) => `${s.source}|${s.startedAt}`));
      const newS = payload.sleepSessions
        .map((s) => importedToSleepSession(userId, s))
        .filter((s) => {
          const key = `${s.source}|${s.startedAt}`;
          if (seenS.has(key)) return false;
          seenS.add(key);
          return true;
        });
      await writeJson(sleepKey(userId), [...newS, ...existingS]);

      return { activities: newA.length, health: newH.length, sleep: newS.length };
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
    async listWorkouts(userId) {
      return (await listWorkoutsDb(client, userId)).map(rowToWorkout);
    },
    async listHealthMetrics(userId) {
      return (await listHealthMetricsDb(client, userId)).map(rowToHealthMetric);
    },
    async listSleepSessions(userId) {
      return (await listSleepSessionsDb(client, userId)).map(rowToSleepSession);
    },
    async listRecords(userId) {
      return (await listRecordsDb(client, userId)).map(rowToRecord);
    },
    async listMuscleSessions(userId) {
      const workouts = await listWorkoutsDb(client, userId);
      const dates = new Map(workouts.map((w) => [w.id, w.completed_at ?? w.created_at]));
      const sets = await listWorkoutSetsForUser(client, userId);
      return buildMuscleSessions(dates, sets);
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
    async listHabitLogs(userId) {
      return (await listHabitLogsDb(client, userId)).map(rowToHabitLog);
    },
    async logHabit(userId, habitId) {
      const row = await insertHabitLog(client, userId, habitId, new Date().toISOString());
      return rowToHabitLog(row);
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
    async listPrograms() {
      return (await listProgramsDb(client)).map(rowToProgram);
    },
    async listEnrolledProgramIds(userId) {
      return (await listEnrollmentsDb(client, userId)).map((e) => e.program_id);
    },
    async enrollProgram(userId, programId) {
      await enrollInProgram(client, userId, programId);
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
      return {
        activities: payload.activities.length,
        health: payload.healthMetrics.length,
        sleep: payload.sleepSessions.length,
      };
    },
    async addWorkout(userId, workout) {
      const row = await insertWorkout(
        client,
        {
          user_id: userId,
          name: workout.name,
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        workout.sets.map((s) => ({
          exercise_id: s.exerciseId,
          order: s.order,
          reps: s.reps ?? null,
          weight_kg: s.weightKg ?? null,
          rpe: s.rpe ?? null,
        })),
      );
      return rowToWorkout(row);
    },
    async listPlannedWorkouts(userId) {
      return (await listPlannedWorkoutsDb(client, userId)).map(rowToWorkout);
    },
    async addPlannedWorkout(userId, input) {
      const row = await insertPlannedWorkout(client, {
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
