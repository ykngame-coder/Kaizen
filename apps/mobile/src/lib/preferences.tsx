import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { secureStorage } from '@/lib/secure-storage';

export type UnitSystem = 'metric' | 'imperial';

/** Device-level app preferences (Master Prompt P17 réglages, P15 confidentialité). */
export interface Preferences {
  units: UnitSystem;
  /** Show the daily briefing notification. */
  dailyBriefing: boolean;
  /** Habit / check-in reminders. */
  reminders: boolean;
  /** Appear in community leaderboards. */
  shareInLeaderboards: boolean;
}

const DEFAULTS: Preferences = {
  units: 'metric',
  dailyBriefing: true,
  reminders: true,
  shareInLeaderboards: true,
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
