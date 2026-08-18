/**
 * SUPOTSU color primitives.
 *
 * Raw palette scales only — no semantic meaning here. Semantic mapping lives in
 * `theme.ts` (light/dark). Keeping primitives separate lets us retheme without
 * touching component code (Master Prompt P28/P47: Theme Engine, dark-first).
 */

export const palette = {
  // Signature brand color — an emerald "growth" primary (kaizen = continuous
  // improvement), replacing the earlier generic blue-purple-pink AI-startup
  // gradient. The full blue→emerald→lime gradient lives in `gradients`.
  brand: {
    50: '#e7fbf3',
    100: '#c2f4e2',
    200: '#8ee8c8',
    300: '#54d8ab',
    400: '#26c18e',
    500: '#19d3a2', // primary
    600: '#0ea37e',
    700: '#0a7d61',
    800: '#065943',
    900: '#033729',
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
  /** Brand: info blue → recovery emerald → lime. Buttons, active states, hero rings. */
  brand: [palette.state.info, palette.accent.recovery, palette.accent.lime],
  /** Positive data: emerald → cyan. Scores, upward trends, recovery. */
  data: ['#00d99b', '#22d3ee'],
} as const;

export type Palette = typeof palette;
export type Gradients = typeof gradients;
