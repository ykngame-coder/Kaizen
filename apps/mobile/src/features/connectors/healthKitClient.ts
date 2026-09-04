import type { ImportedActivity, ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';
import type { ActivityInput, NutritionEntryInput } from '@supotsu/shared';

/**
 * Default (web / Android) stub for the native HealthKit client. The real
 * implementation lives in `healthKitClient.ios.ts` and is only bundled on iOS,
 * so the web build never imports the native module.
 */
export function healthKitAvailable(): boolean {
  return false;
}

export async function syncHealthKit(): Promise<{
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  sleepSessions: ImportedSleepSession[];
}> {
  throw new Error('HealthKit est disponible uniquement sur iOS (build natif).');
}

export function subscribeHealthKitChanges(_onChange: () => void): () => void {
  return () => undefined;
}

export async function saveActivityToHealthKit(_input: ActivityInput): Promise<void> {
  /* no-op off iOS */
}

export async function saveWorkoutToHealthKit(_setCount: number, _at?: Date): Promise<void> {
  /* no-op off iOS */
}

export async function saveNutritionToHealthKit(_input: NutritionEntryInput): Promise<void> {
  /* no-op off iOS */
}

export async function queryHeartRateSummary(_start: Date, _end: Date): Promise<{ avgHeartRate: number; maxHeartRate: number } | null> {
  return null; // no-op off iOS
}
