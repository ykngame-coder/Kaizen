import type { ImportedActivity, ImportedHealthMetric, ImportedSleepSession } from '@supotsu/connectors';

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
