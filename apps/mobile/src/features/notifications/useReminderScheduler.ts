import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { computeCircadianProfile, plannedReminders, type PlannedReminder, type ReminderKind } from '@supotsu/engines';
import { useHabitLogs, useHabits, useHealthMetrics, useNutritionEntries, useSleepSessions, useWorkouts } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { notificationHost } from './notificationHost';
import { syncReminders } from './reminderScheduler';

/** Objectif d'hydratation retenu quand l'utilisateur n'en a pas fixé un. */
const DEFAULT_HYDRATION_ML = 2500;
/** Les recalculs sont regroupés : ouvrir l'app déclenche plusieurs requêtes à la suite. */
const DEBOUNCE_MS = 800;

/** Où mène un rappel qu'on touche. */
const DESTINATION: Record<ReminderKind, Href> = {
  habits: '/profile/habits',
  bedtime: '/sommeil/circadian',
  session: '/sport',
  hydration: '/nutrition',
};

/**
 * Recalcule et reprogramme les rappels locaux : au premier plan, et chaque
 * fois que les données ou les réglages changent. Monté une seule fois, haut
 * dans l'arbre.
 *
 * Rien n'est programmé tant que les données ne sont pas chargées : mieux vaut
 * garder les rappels existants que les remplacer à partir d'un état vide.
 */
export function useReminderScheduler(): void {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences, ready } = usePreferences();
  const settings = preferences.reminderSettings;
  const { data: habits, isPending: habitsPending } = useHabits();
  const { data: habitLogs, isPending: logsPending } = useHabitLogs();
  const { data: workouts, isPending: workoutsPending } = useWorkouts();
  const { data: sleepSessions, isPending: sleepPending } = useSleepSessions();
  const { data: nutrition, isPending: nutritionPending } = useNutritionEntries();
  const { data: health, isPending: healthPending } = useHealthMetrics();

  const enabled = settings.habits.enabled || settings.bedtime.enabled || settings.session.enabled || settings.hydration.enabled;
  const loading = habitsPending || logsPending || workoutsPending || sleepPending || nutritionPending || healthPending;

  const runRef = useRef<() => void>(() => undefined);
  runRef.current = (): void => {
    if (Platform.OS !== 'ios' || !ready) return;
    void (async () => {
      // Réglages tous éteints (ou autorisation retirée) : on annule les nôtres
      // en synchronisant sur une liste vide, plutôt que de les laisser sonner.
      const allowed = (await notificationHost.permission()) === 'granted' && enabled;
      if (!allowed) {
        await syncReminders(notificationHost, [], () => ({ title: '', body: '' }));
        return;
      }
      if (loading) return;

      const now = new Date();
      const chronotype = computeCircadianProfile(health ?? [], now.toISOString(), {
        tzOffsetMinutes: -now.getTimezoneOffset(),
        goalHours: preferences.sleepGoalHours,
      }).value;

      const wanted = plannedReminders(
        {
          habits: habits ?? [],
          habitLogs: habitLogs ?? [],
          workouts: workouts ?? [],
          nutrition: nutrition ?? [],
          sleepSessions: sleepSessions ?? [],
          hydrationGoalMl: preferences.nutritionGoals?.hydrationMl ?? DEFAULT_HYDRATION_ML,
          chronotype: chronotype ? { idealBedtime: chronotype.idealBedtime, idealWake: chronotype.idealWake } : null,
        },
        settings,
        now,
      );
      await syncReminders(notificationHost, wanted, textFor);
    })();
  };

  const textFor = (r: PlannedReminder): { title: string; body: string } => {
    // Les litres se composent ici : le module pur ne connaît ni langue ni format.
    const params =
      r.kind === 'hydration'
        ? { ...r.params, litres: (Number(r.params.remainingMl ?? 0) / 1000).toFixed(1) }
        : r.params;
    return {
      title: t(`notifications.reminders.sent.${r.kind}.title`, params),
      body: t(`notifications.reminders.sent.${r.kind}.body`, params),
    };
  };

  // Données, réglages : un changement suffit à reprogrammer, après regroupement.
  useEffect(() => {
    const timer = setTimeout(() => runRef.current(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [settings, habits, habitLogs, workouts, sleepSessions, nutrition, health, ready, loading]);

  // Retour au premier plan : le jour a pu changer, et les conditions avec lui.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runRef.current();
    });
    return () => sub.remove();
  }, []);

  // Toucher un rappel ouvre l'écran qui permet d'y donner suite.
  useEffect(() => {
    return notificationHost.onResponse((data) => {
      const kind = data.kind as ReminderKind | undefined;
      if (kind && DESTINATION[kind]) router.push(DESTINATION[kind]);
    });
  }, [router]);
}
