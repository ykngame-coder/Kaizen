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
  // Neutral ramp — premium dark identity (#071018 bg, #101923 / #172330 cards).
  neutral: {
    0: '#ffffff',
    50: '#f6f7f9',
    100: '#eceef2',
    200: '#d5d9e0',
    300: '#aab6c5', // dark textMuted
    400: '#8a93a3',
    500: '#748092', // dark textSubtle
    600: '#49515f',
    700: '#1e2733', // dark hairline border
    800: '#172330', // secondary card
    900: '#101923', // card
    950: '#071018', // deepest background (dark mode)
  },
  // Secondary accents for sport categories / statistics (Master Prompt P28.5).
  accent: {
    strength: '#ff8b5e', // force
    endurance: '#3bcbff', // endurance / cardio
    mobility: '#8b5cf6', // mobilité
    recovery: '#19d3a2', // récupération
    lime: '#c6f24e', // secondary highlight accent (energy / streaks / focus)
    data: '#2be38b', // emerald — positive data-viz (scores, upward trends)
  },
  // System / state colors (premium palette).
  state: {
    success: '#2be38b',
    warning: '#f5b742',
    error: '#ff4d67',
    info: '#2d7ff9',
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
