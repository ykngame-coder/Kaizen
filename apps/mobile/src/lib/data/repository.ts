import type { Activity, HealthMetric, Habit, HabitLog, NutritionEntry, Workout, SetEntry } from '@supotsu/core';
import type { ActivityInput, HabitInput, NutritionEntryInput } from '@supotsu/shared';
import type { ImportedActivity, ImportedHealthMetric } from '@supotsu/connectors';
import {
  insertActivity,
  listActivities as listActivitiesDb,
  insertWorkout,
  listWorkouts as listWorkoutsDb,
  insertHealthMetrics,
  listHealthMetrics as listHealthMetricsDb,
  insertNutritionEntry,
  listNutritionEntries as listNutritionEntriesDb,
  insertHabit,
  listHabits as listHabitsDb,
  insertHabitLog,
  listHabitLogs as listHabitLogsDb,
  type ActivityRow,
  type WorkoutRow,
  type HealthMetricRow,
  type NutritionEntryRow,
  type HabitRow,
  type HabitLogRow,
} from '@supotsu/database';
import { getSupabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secure-storage';
import { randomId } from '@/lib/id';

export interface NewWorkout {
  name: string;
  sets: Omit<SetEntry, 'id' | 'workoutId'>[];
}

export interface ImportPayload {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
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
  listHealthMetrics(userId: string): Promise<HealthMetric[]>;
  listNutritionEntries(userId: string): Promise<NutritionEntry[]>;
  addNutritionEntry(userId: string, input: NutritionEntryInput): Promise<NutritionEntry>;
  listHabits(userId: string): Promise<Habit[]>;
  addHabit(userId: string, input: HabitInput): Promise<Habit>;
  listHabitLogs(userId: string): Promise<HabitLog[]>;
  logHabit(userId: string, habitId: string): Promise<HabitLog>;
  /** Persist a validated connector import; returns how many rows were added. */
  persistImport(
    userId: string,
    payload: ImportPayload,
  ): Promise<{ activities: number; health: number }>;
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

// --- demo (local) implementation ------------------------------------------
const actKey = (u: string): string => `supotsu.activities.${u}`;
const wkKey = (u: string): string => `supotsu.workouts.${u}`;
const hmKey = (u: string): string => `supotsu.health.${u}`;
const nutKey = (u: string): string => `supotsu.nutrition.${u}`;
const habKey = (u: string): string => `supotsu.habits.${u}`;
const hlogKey = (u: string): string => `supotsu.habitlogs.${u}`;

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
      return created;
    },
    async listHealthMetrics(userId) {
      const items = await readJson<HealthMetric>(hmKey(userId));
      return items.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
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
    async persistImport(userId, payload) {
      const existingA = await readJson<Activity>(actKey(userId));
      const newA = payload.activities.map((a) => importedToActivity(userId, a));
      await writeJson(actKey(userId), [...newA, ...existingA]);

      const existingH = await readJson<HealthMetric>(hmKey(userId));
      const seen = new Set(existingH.map((h) => `${h.type}|${h.measuredAt}`));
      const newH = payload.healthMetrics
        .map((m) => importedToHealth(userId, m))
        .filter((h) => !seen.has(`${h.type}|${h.measuredAt}`));
      await writeJson(hmKey(userId), [...newH, ...existingH]);

      return { activities: newA.length, health: newH.length };
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
    async persistImport(userId, payload) {
      for (const a of payload.activities) {
        await insertActivity(client, {
          user_id: userId,
          type: a.type,
          source: a.source,
          started_at: a.startedAt,
          duration_sec: a.durationSec,
          distance_m: a.distanceM ?? null,
          calories: a.calories ?? null,
          intensity: a.intensity ?? null,
          avg_heart_rate: a.avgHeartRate ?? null,
        });
      }
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
      return { activities: payload.activities.length, health: payload.healthMetrics.length };
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
  };
}

export function createDataRepository(): DataRepository {
  const client = getSupabase();
  return client ? createSupabaseRepository(client) : createDemoRepository();
}
