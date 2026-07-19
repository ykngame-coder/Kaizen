import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { themes, type SemanticColors, type ThemeName } from '@supotsu/design-system';

type ThemePreference = ThemeName | 'system';

interface ThemeContextValue {
  /** Resolved theme actually in effect. */
  name: ThemeName;
  /** User preference, which may be 'system'. */
  preference: ThemePreference;
  colors: SemanticColors;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme provider. Dark-first: when the preference is 'system' and the OS scheme
 * is unknown, we fall back to dark (Master Prompt P28.6). Components read colors
 * from here so light/dark is a single source of truth.
 */
export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: React.ReactNode;
  initialPreference?: ThemePreference;
}): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const name: ThemeName = preference === 'system' ? (systemScheme ?? 'dark') : preference;

  const toggle = useCallback(() => {
    setPreference((prev) => {
      const current: ThemeName = prev === 'system' ? (systemScheme ?? 'dark') : prev;
      return current === 'dark' ? 'light' : 'dark';
    });
  }, [systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ name, preference, colors: themes[name], setPreference, toggle }),
    [name, preference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
