/**
 * SUPOTSU color primitives.
 *
 * Raw palette scales only — no semantic meaning here. Semantic mapping lives in
 * `theme.ts` (light/dark). Keeping primitives separate lets us retheme without
 * touching component code (Master Prompt P28/P47: Theme Engine, dark-first).
 */

export const palette = {
  // Signature brand color — the Kaizen Supotsu logo gradient collapses to a
  // "blurple" primary; the full blue→purple→pink gradient lives in `gradients`.
  brand: {
    50: '#f0ecff',
    100: '#dcd0ff',
    200: '#c0aaff',
    300: '#a17dff',
    400: '#8a5cff',
    500: '#7c5cff', // primary
    600: '#6a3ff0',
    700: '#5730c9',
    800: '#3f2391',
    900: '#281559',
  },
  // Neutral ramp tuned for OLED-friendly dark surfaces.
  neutral: {
    0: '#ffffff',
    50: '#f6f7f9',
    100: '#eceef2',
    200: '#d5d9e0',
    300: '#b0b7c3',
    400: '#8a93a3',
    500: '#656e7e',
    600: '#49515f',
    700: '#333a45',
    800: '#1e232b',
    900: '#141820',
    950: '#0b0e13', // deepest background (dark mode)
  },
  // Secondary accents for sport categories / statistics (Master Prompt P28.5).
  accent: {
    strength: '#ff7a45', // force
    endurance: '#3b9dff', // endurance / cardio
    mobility: '#a78bfa', // mobilité
    recovery: '#22d3ee', // récupération
    lime: '#c6f24e', // secondary highlight accent (energy / streaks / focus)
    data: '#00d99b', // emerald — positive data-viz (scores, upward trends)
  },
  // System / state colors (Master Prompt P28.5, P47.4).
  state: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

/**
 * Signature gradients (Kaizen Supotsu logo). Multi-stop arrays consumed by the
 * `Gradient` primitive — kept out of the semantic theme so the CSS-variable
 * derivation stays string-only.
 */
export const gradients = {
  /** Brand: blue → purple → pink. Buttons, active states, hero rings. */
  brand: ['#4c8dff', '#8b5cf6', '#ec4899'],
  /** Positive data: emerald → cyan. Scores, upward trends, recovery. */
  data: ['#00d99b', '#22d3ee'],
} as const;

export type Palette = typeof palette;
export type Gradients = typeof gradients;
