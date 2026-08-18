/**
 * Semantic themes. Components consume these role tokens (never raw palette),
 * so light/dark and future rebrands stay a single source of truth.
 * Dark is the reference theme (Master Prompt P28.6: Dark Mode prioritaire).
 */

import { palette } from './colors';

export interface SemanticColors {
  /** App background, furthest back. */
  background: string;
  /** Raised surfaces: cards, sheets. */
  surface: string;
  /** Surface one level higher (e.g. nested card, pressed state). */
  surfaceElevated: string;
  /** Hairline borders / dividers. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary / supporting text. */
  textMuted: string;
  /** Disabled / lowest-emphasis text. */
  textSubtle: string;
  /** Brand / primary action. */
  primary: string;
  /** Foreground placed on top of `primary`. */
  onPrimary: string;
  /**
   * Foreground placed on top of the brand gradient (score cards, gradient
   * buttons, avatar fills). Separate from `onPrimary` because the gradient
   * runs light (emerald→lime) — white text loses contrast on it, while
   * `onPrimary` still needs to stay white for solid, darker fills (danger,
   * quick-action buttons).
   */
  onGradient: string;
  /** Sport-category accents. */
  accentStrength: string;
  accentEndurance: string;
  accentMobility: string;
  accentRecovery: string;
  /** Secondary highlight accent (energy / streaks / focus) — lime. */
  accentLime: string;
  /** Positive data-viz accent (scores, upward trends) — emerald. */
  accentData: string;
  /** State colors. */
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const darkTheme: SemanticColors = {
  background: palette.neutral[950],
  surface: palette.neutral[900],
  surfaceElevated: palette.neutral[800],
  border: palette.neutral[700],
  text: palette.neutral[50],
  textMuted: palette.neutral[300],
  textSubtle: palette.neutral[500],
  primary: palette.brand[500],
  onPrimary: palette.neutral[0],
  onGradient: palette.neutral[950],
  accentStrength: palette.accent.strength,
  accentEndurance: palette.accent.endurance,
  accentMobility: palette.accent.mobility,
  accentRecovery: palette.accent.recovery,
  accentLime: palette.accent.lime,
  accentData: palette.accent.data,
  success: palette.state.success,
  warning: palette.state.warning,
  error: palette.state.error,
  info: palette.state.info,
};

export const lightTheme: SemanticColors = {
  background: palette.neutral[50],
  surface: palette.neutral[0],
  surfaceElevated: palette.neutral[100],
  border: palette.neutral[200],
  text: palette.neutral[900],
  textMuted: palette.neutral[600],
  textSubtle: palette.neutral[400],
  primary: palette.brand[600],
  onPrimary: palette.neutral[0],
  onGradient: palette.neutral[950],
  accentStrength: palette.accent.strength,
  accentEndurance: palette.accent.endurance,
  accentMobility: palette.accent.mobility,
  accentRecovery: palette.accent.recovery,
  accentLime: palette.accent.lime,
  accentData: palette.accent.data,
  success: palette.state.success,
  warning: palette.state.warning,
  error: palette.state.error,
  info: palette.state.info,
};

export type ThemeName = 'light' | 'dark';

export const themes: Record<ThemeName, SemanticColors> = {
  light: lightTheme,
  dark: darkTheme,
};
