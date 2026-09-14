import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { estimateActivityHeartRateWindow, estimateWorkoutHeartRateWindow } from '@supotsu/connectors';
import { healthKitAvailable, queryHeartRateSummary, subscribeHealthKitChanges } from './healthKitClient';
import { useHealthSync } from './healthSync';
import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secure-storage';
import { createDataRepository, type DataRepository } from '@/lib/data/repository';

const CONNECTED_KEY = 'supotsu.healthkit.connected';

/** Call once, right after a successful manual "Autoriser & synchroniser" — marks HealthKit as connected so future app launches sync silently instead of waiting for another tap. */
export async function markHealthKitConnected(): Promise<void> {
  await secureStorage.setItem(CONNECTED_KEY, 'true');
}

/** Whether the user has connected HealthKit at least once — gates both auto-sync and the write-back helpers in queries.ts. */
export async function isHealthKitConnected(): Promise<boolean> {
  return (await secureStorage.getItem(CONNECTED_KEY)) === 'true';
}

const HEART_RATE_BACKFILL_DAYS = 3;

/**
 * Re-checks the last few days of completed workouts/activities still
 * missing heart rate and retries the same window-estimate-and-query step —
 * catching up once a watch's data has landed in Apple Santé after the
 * session's own completion (the immediate attempt in queries.ts can miss
 * this if the watch hadn't synced to the phone yet). Best-effort throughout.
 */
async function backfillHeartRate(userId: string, repo: DataRepository): Promise<void> {
  const cutoffMs = Date.now() - HEART_RATE_BACKFILL_DAYS * 24 * 60 * 60 * 1000;

  try {
    const workouts = await repo.listWorkouts(userId);
    for (const w of workouts) {
      if (w.status !== 'completed' || !w.completedAt || w.avgHeartRate != null) continue;
      if (new Date(w.completedAt).getTime() < cutoffMs) continue;
      const sets = await repo.getWorkoutSets(userId, w.id);
      const window = estimateWorkoutHeartRateWindow(w.completedAt, sets.length);
      const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
      if (summary) await repo.setWorkoutHeartRate(userId, w.id, summary);
    }
  } catch {
    // Best-effort.
  }

  try {
    const activities = await repo.listActivities(userId);
    for (const a of activities) {
      if (a.source === 'apple_health' || a.avgHeartRate != null) continue;
      if (new Date(a.startedAt).getTime() < cutoffMs) continue;
      const window = estimateActivityHeartRateWindow(a.startedAt, a.durationSec);
      const summary = await queryHeartRateSummary(new Date(window.start), new Date(window.end));
      if (summary) await repo.setActivityHeartRate(userId, a.id, summary);
    }
  } catch {
    // Best-effort.
  }
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
  const requestSync = useHealthSync();
  const requestRef = useRef(requestSync);
  requestRef.current = requestSync;
  const startedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || startedRef.current) return;
    if (authStatus !== 'authenticated' || !user) return;
    startedRef.current = true;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // Incrémental : l'orchestrateur bascule seul en complet à la première
    // synchro (aucune ancre) et au filet hebdomadaire.
    const runSync = async (): Promise<void> => {
      await requestRef.current('incremental');
      if (user) await backfillHeartRate(user.id, createDataRepository());
    };

    void (async () => {
      if (!healthKitAvailable() || !(await isHealthKitConnected())) return;
      if (cancelled) return;
      void runSync();
      // Huit abonnements, une seule file : une arrivée de données touchant
      // plusieurs types ne donne qu'une synchro, plus un tour au plus.
      unsubscribe = subscribeHealthKitChanges(() => void runSync());
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authStatus, user]);
}

/**
 * Pull-to-refresh handlers call this before invalidating queries — otherwise
 * "swipe down to refresh" only re-reads whatever's already in Supabase and
 * looks like it did nothing when Apple Health has newer data that hasn't
 * synced yet. Incrémental : seules les nouveautés depuis la dernière synchro
 * sont lues, c'est presque instantané.
 */
export function useManualHealthKitSync(): () => Promise<void> {
  const { user } = useAuth();
  const requestSync = useHealthSync();
  return async () => {
    if (Platform.OS !== 'ios' || !healthKitAvailable() || !(await isHealthKitConnected())) return;
    await requestSync('incremental');
    if (user) await backfillHeartRate(user.id, createDataRepository());
  };
}
