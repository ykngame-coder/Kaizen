/**
 * Typographic scale. A dedicated `data` family gives scores, records and
 * numeric stats a tabular, high-legibility treatment (Master Prompt P47.6:
 * "style spécifique pour performances, records, statistiques").
 */

export const fontFamily = {
  /** UI text. Replaced by the app's loaded font at runtime. */
  sans: 'System',
  /** Numeric / data display — tabular figures. */
  data: 'System',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
  '4xl': 44,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Line-height ratios. RN needs absolute px, so variants below multiply out. */
export const lineHeight = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
} as const;

const lh = (size: number, ratio: number): number => Math.round(size * ratio);

/**
 * Named text roles. `lineHeight` is an absolute pixel value because React
 * Native interprets it as px (not a multiplier) — using a ratio collapses lines.
 */
export const textVariants = {
  display: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize['4xl'], lineHeight.tight),
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize['2xl'], lineHeight.tight),
  },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lh(fontSize.base, lineHeight.normal),
  },
  caption: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lh(fontSize.sm, lineHeight.normal),
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(fontSize.xs, lineHeight.snug),
  },
  /** Big score / record numerals. */
  data: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize['3xl'], lineHeight.tight),
  },
} as const;

export type TextVariant = keyof typeof textVariants;
