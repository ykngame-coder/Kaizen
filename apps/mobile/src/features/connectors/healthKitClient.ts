/**
 * Default (web / Android) stub for the native HealthKit client. The real
 * implementation lives in `healthKitClient.ios.ts` and is only bundled on iOS,
 * so the web build never imports the native module.
 */
export function healthKitAvailable(): boolean {
  return false;
}

export async function syncHealthKit(): Promise<{ ingested: number }> {
  throw new Error('HealthKit est disponible uniquement sur iOS (build natif).');
}
