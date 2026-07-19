/** Spacing, radii and motion primitives — shared by mobile (NativeWind) and future web. */

/** 4pt spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/** Animation durations (ms). Motion is functional only (Master Prompt P28.13/P47.13). */
export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export type Spacing = keyof typeof spacing;
export type Radii = keyof typeof radii;
