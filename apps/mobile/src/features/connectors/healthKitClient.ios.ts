import * as HealthKit from '@kingstinct/react-native-healthkit';
import { createIngestToken, ingestUrl } from './appleHealthClient';

/**
 * Native HealthKit client (iOS only). Reads the metrics we support directly from
 * Apple Health on-device, then POSTs them to the same ingest endpoint the Health
 * Auto Export automation uses — so HealthKit data flows through the exact same
 * pipeline (source `apple_health`, deduped) as the rest of the app.
 *
 * Requires a native build (Expo Go doesn't include HealthKit). The library uses
 * Nitro modules with strict generics; we call it through a permissive shape to
 * keep the mapping readable and version-tolerant.
 */
interface HKSample {
  quantity?: number;
  value?: number;
  startDate: string | number | Date;
  endDate?: string | number | Date;
}
interface HKModule {
  isHealthDataAvailable: () => boolean;
  requestAuthorization: (auth: { toRead: readonly string[] }) => Promise<boolean>;
  queryQuantitySamples: (id: string, options: Record<string, unknown>) => Promise<readonly HKSample[]>;
  queryCategorySamples: (id: string, options: Record<string, unknown>) => Promise<readonly HKSample[]>;
}
const hk = HealthKit as unknown as HKModule;

const QUANTITY: { id: string; type: string; unit: string }[] = [
  { id: 'HKQuantityTypeIdentifierRestingHeartRate', type: 'resting_heart_rate', unit: 'count/min' },
  { id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', type: 'hrv', unit: 'ms' },
  { id: 'HKQuantityTypeIdentifierBodyMass', type: 'weight', unit: 'kg' },
  { id: 'HKQuantityTypeIdentifierBodyFatPercentage', type: 'body_fat', unit: '%' },
  { id: 'HKQuantityTypeIdentifierLeanBodyMass', type: 'muscle_mass', unit: 'kg' },
];
const SLEEP_ID = 'HKCategoryTypeIdentifierSleepAnalysis';

export function healthKitAvailable(): boolean {
  try {
    return hk.isHealthDataAvailable();
  } catch {
    return false;
  }
}

const toIso = (d: string | number | Date): string => new Date(d).toISOString();

/** Request permissions, read recent samples and push them to the ingest endpoint. */
export async function syncHealthKit(): Promise<{ ingested: number }> {
  const url = ingestUrl();
  if (!url) throw new Error('Backend Supabase non configuré.');

  await hk.requestAuthorization({ toRead: [...QUANTITY.map((q) => q.id), SLEEP_ID] });

  const metrics: { type: string; value: number; date: string }[] = [];

  for (const q of QUANTITY) {
    try {
      const samples = await hk.queryQuantitySamples(q.id, { unit: q.unit, ascending: false, limit: 400 });
      for (const s of samples) {
        const value = Number(s.quantity ?? s.value);
        if (Number.isFinite(value)) metrics.push({ type: q.type, value, date: toIso(s.startDate) });
      }
    } catch {
      /* metric unavailable / not authorised */
    }
  }

  // Sleep: sum asleep minutes per night; use the earliest asleep start as the
  // bedtime (measured_at), matching our sleep_duration convention.
  try {
    const samples = await hk.queryCategorySamples(SLEEP_ID, { ascending: false, limit: 1000 });
    const nights = new Map<string, { mins: number; start: number }>();
    for (const s of samples) {
      const v = Number(s.value);
      const asleep = v === 1 || v >= 3; // 1 asleepUnspecified, 3 core, 4 deep, 5 REM (0 inBed, 2 awake)
      if (!asleep || s.endDate == null) continue;
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      const key = new Date(start).toISOString().slice(0, 10);
      const cur = nights.get(key) ?? { mins: 0, start };
      cur.mins += (end - start) / 60000;
      cur.start = Math.min(cur.start, start);
      nights.set(key, cur);
    }
    for (const { mins, start } of nights.values()) {
      if (mins > 60) metrics.push({ type: 'sleep_duration', value: Number((mins / 60).toFixed(2)), date: new Date(start).toISOString() });
    }
  } catch {
    /* sleep unavailable */
  }

  if (metrics.length === 0) return { ingested: 0 };

  const token = await createIngestToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Supotsu-Token': token },
    body: JSON.stringify({ metrics }),
  });
  const body = (await res.json().catch(() => ({}))) as { ingested?: number };
  return { ingested: Number(body.ingested ?? 0) };
}
