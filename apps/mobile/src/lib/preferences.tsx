import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { setHapticsEnabled } from '@supotsu/ui';
import i18n, { detectDeviceLanguage, type LanguagePreference } from '@/i18n';
import { secureStorage } from '@/lib/secure-storage';

export type UnitSystem = 'metric' | 'imperial';
export type TimeFormat = '24h' | '12h';
export type { LanguagePreference } from '@/i18n';

/** Réveil intelligent, stored locally (Master Prompt : 100% offline). Rings only reliably while the app is open — see SleepTrackingScreen / AlarmSettingsScreen. */
export interface SleepAlarmSettings {
  enabled: boolean;
  hour: number;
  minute: number;
  /** 0=dimanche … 6=samedi. Empty = tous les jours. */
  repeatDays: number[];
  /** Fenêtre de déclenchement intelligent avant l'heure réglée, en minutes ; 0 = alarme simple. */
  windowMin: 0 | 15 | 30;
  volumeRampSec: number;
  vibration: boolean;
  /** Minutes de report ; 0 = snooze désactivé. */
  snoozeMin: number;
}

/** Starting point for the alarm settings form before the user has configured one — spec defaults (fenêtre 30 min). */
export const DEFAULT_SLEEP_ALARM: SleepAlarmSettings = {
  enabled: false,
  hour: 7,
  minute: 0,
  repeatDays: [],
  windowMin: 30,
  volumeRampSec: 30,
  vibration: true,
  snoozeMin: 9,
};

/** One customizable Dashboard card's visibility, in display order. */
export interface DashboardCardPref {
  id: string;
  visible: boolean;
}

/** Device-level app preferences (Master Prompt P17 réglages, P15 confidentialité). */
export interface Preferences {
  units: UnitSystem;
  /** Show the daily briefing notification. */
  dailyBriefing: boolean;
  /** Habit / check-in reminders. */
  reminders: boolean;
  /** Primary goal archetype — personalises the whole app (mockup #17). */
  primaryGoal?: string;
  /** Manual nutrition targets — override the auto-estimated ones when set. */
  nutritionGoals?: { kcal: number; proteinG: number; hydrationMl: number };
  /** How times are displayed throughout the app. */
  timeFormat: TimeFormat;
  /** Haptic feedback on buttons and toggles (native only). */
  haptics: boolean;
  /** Require Face ID / Touch ID to open the app (native only). */
  biometricLock: boolean;
  /** User-chosen daily step target (steps have no auto-estimated goal, unlike nutrition). */
  dailyStepsGoal: number;
  /**
   * Dashboard card order + visibility. Undefined until the user customizes
   * it — DashboardScreen falls back to its own default order/visibility, so
   * this only needs writing when the user actually changes something.
   */
  dashboardCards?: DashboardCardPref[];
  /** Undefined until the user configures the phone-tracking smart alarm. */
  sleepAlarm?: SleepAlarmSettings;
  /** 'auto' follows the phone's language (expo-localization); otherwise a specific choice. */
  language: LanguagePreference;
}

const DEFAULTS: Preferences = {
  units: 'metric',
  dailyBriefing: true,
  reminders: true,
  primaryGoal: 'fat_loss',
  timeFormat: '24h',
  haptics: true,
  biometricLock: false,
  dailyStepsGoal: 10_000,
  language: 'auto',
};

const STORAGE_KEY = 'supotsu.preferences';

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  ready: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const raw = await secureStorage.getItem(STORAGE_KEY);
      if (active && raw) {
        try {
          setPreferences({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) });
        } catch {
          // ignore corrupt prefs, keep defaults
        }
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]): void => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      void secureStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    setHapticsEnabled(preferences.haptics);
  }, [preferences.haptics]);

  // Hot-swap: i18n already started on the phone's language at import time
  // (apps/mobile/src/i18n/index.ts) — this only needs to act once the
  // persisted choice loads, or whenever the user picks a language.
  useEffect(() => {
    if (!ready) return;
    const lang = preferences.language === 'auto' ? detectDeviceLanguage() : preferences.language;
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
  }, [preferences.language, ready]);

  const value = useMemo(() => ({ preferences, setPreference, ready }), [preferences, ready]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}

const KG_TO_LB = 2.20462;
const KM_TO_MI = 0.621371;

/** Format a weight in kg according to the unit preference. */
export function formatWeight(kg: number, units: UnitSystem): string {
  return units === 'imperial' ? `${(kg * KG_TO_LB).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

/** Format a distance in metres according to the unit preference. */
export function formatDistance(metres: number, units: UnitSystem): string {
  const km = metres / 1000;
  return units === 'imperial' ? `${(km * KM_TO_MI).toFixed(1)} mi` : `${km.toFixed(1)} km`;
}

/** Format an hour:minute pair (24h wall-clock values, minute can wrap) according to the time preference. */
export function formatClock(hour: number, minute: number, timeFormat: TimeFormat): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = String(Math.floor(minute)).padStart(2, '0');
  if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Format an ISO timestamp's clock time according to the time preference. */
export function formatClockFromIso(iso: string, timeFormat: TimeFormat): string {
  const d = new Date(iso);
  return formatClock(d.getHours(), d.getMinutes(), timeFormat);
}
