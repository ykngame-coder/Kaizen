/**
 * SUPOTSU color primitives.
 *
 * Raw palette scales only — no semantic meaning here. Semantic mapping lives in
 * `theme.ts` (light/dark). Keeping primitives separate lets us retheme without
 * touching component code (Master Prompt P28/P47: Theme Engine, dark-first).
 */

export const palette = {
  // Signature brand color — energetic emerald = progression / health / performance.
  brand: {
    50: '#e6fff7',
    100: '#b3ffe8',
    200: '#80ffd9',
    300: '#4dffca',
    400: '#1af0b4',
    500: '#00d99b', // primary
    600: '#00b37f',
    700: '#008c64',
    800: '#006649',
    900: '#00402e',
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
  },
  // System / state colors (Master Prompt P28.5, P47.4).
  state: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

export type Palette = typeof palette;
