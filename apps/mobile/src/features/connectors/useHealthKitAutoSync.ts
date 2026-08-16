import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { healthKitAvailable, subscribeHealthKitChanges, syncHealthKit } from './healthKitClient';
import { useImportHealth } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secure-storage';

const CONNECTED_KEY = 'supotsu.healthkit.connected';

/** Call once, right after a successful manual "Autoriser & synchroniser" — marks HealthKit as connected so future app launches sync silently instead of waiting for another tap. */
export async function markHealthKitConnected(): Promise<void> {
  await secureStorage.setItem(CONNECTED_KEY, 'true');
}

/** Whether the user has connected HealthKit at least once — gates both auto-sync and the write-back helpers in queries.ts. */
export async function isHealthKitConnected(): Promise<boolean> {
  return (await secureStorage.getItem(CONNECTED_KEY)) === 'true';
}

/**
 * Once the user has connected HealthKit at least once, this syncs silently
 * on every app open (no more manual "Autoriser & synchroniser" tap needed)
 * and again whenever Apple Health delivers new data while the app stays
 * alive (foreground or backgrounded) via HealthKit background delivery —
 * best-effort: iOS doesn't guarantee exact timing, and the manual button on
 * the Devices screen remains the reliable fallback. Mount once, high in the
 * tree, after auth is resolved.
 */
export function useHealthKitAutoSync(): void {
  const { user, status: authStatus } = useAuth();
  const importHealth = useImportHealth();
  const importRef = useRef(importHealth);
  importRef.current = importHealth;
  const startedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || startedRef.current) return;
    if (authStatus !== 'authenticated' || !user) return;
    startedRef.current = true;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const runSync = async (): Promise<void> => {
      try {
        const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
        if (activities.length + healthMetrics.length + sleepSessions.length > 0) {
          await importRef.current.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
        }
      } catch {
        // Best-effort — the manual button on the Devices screen is the fallback.
      }
    };

    void (async () => {
      if (!healthKitAvailable() || !(await isHealthKitConnected())) return;
      if (cancelled) return;
      void runSync();
      unsubscribe = subscribeHealthKitChanges(() => void runSync());
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authStatus, user]);
}
