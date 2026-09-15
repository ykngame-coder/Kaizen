import type { FullRead, HealthSource } from './healthSource';
import type { ActivityInput, NutritionEntryInput } from '@supotsu/shared';

/**
 * Default (web / Android) stub for the native HealthKit client. The real
 * implementation lives in `healthKitClient.ios.ts` and is only bundled on iOS,
 * so the web build never imports the native module.
 */
export function healthKitAvailable(): boolean {
  return false;
}

export async function syncHealthKit(): Promise<FullRead> {
  throw new Error(IOS_ONLY);
}

const IOS_ONLY = 'HealthKit est disponible uniquement sur iOS (build natif).';

/** Bouchon : aucun type suivi hors iOS, et toute lecture échoue. */
export const nativeHealthSource: HealthSource = {
  types: [],
  authorize: () => Promise.reject(new Error(IOS_ONLY)),
  currentAnchor: () => Promise.resolve(null),
  changesSince: () => Promise.reject(new Error(IOS_ONLY)),
  readSleep: () => Promise.reject(new Error(IOS_ONLY)),
  stepTotals: () => Promise.reject(new Error(IOS_ONLY)),
  readQuantity: () => Promise.reject(new Error(IOS_ONLY)),
  fullRead: () => Promise.reject(new Error(IOS_ONLY)),
};

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

export async function readDateOfBirth(): Promise<string | null> {
  return null; // no-op off iOS
}

export async function queryEffortScore(_start: Date, _end: Date): Promise<number | null> {
  return null; // no-op off iOS
}
