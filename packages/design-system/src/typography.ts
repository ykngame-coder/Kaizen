/**
 * Typographic scale. Three families give the app its own identity instead of
 * the system default: Oswald (condensed, uppercase) for titles/headings,
 * Barlow for everyday UI text, and Archivo Black for scores/records/stats —
 * a dedicated `data` family gives them a bold, tabular, high-legibility
 * treatment (Master Prompt P47.6: "style spécifique pour performances,
 * records, statistiques"). Loaded via @expo-google-fonts in app/_layout.tsx.
 */

export const fontFamily = {
  /** Titles and section headings. */
  display: 'Oswald_700Bold',
  /** UI text. */
  sans: 'Barlow_400Regular',
  /** Numeric / data display — tabular figures. */
  data: 'ArchivoBlack_400Regular',
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
 *
 * Each Google Fonts weight ships as its own named font file (e.g.
 * 'Barlow_700Bold' is a distinct family from 'Barlow_400Regular', not a
 * `fontWeight` variant of it) — so `fontFamily` alone carries the weight
 * here and no `fontWeight` is set. A `style={{ fontWeight: '700' }}` override
 * on a screen has no visual effect once a named family is set; that's a
 * known trade-off of static Google Fonts, not a bug.
 */
export const textVariants = {
  display: {
    fontFamily: 'Oswald_700Bold',
    fontSize: fontSize['4xl'],
    lineHeight: lh(fontSize['4xl'], lineHeight.tight),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'Oswald_700Bold',
    fontSize: fontSize['2xl'],
    lineHeight: lh(fontSize['2xl'], lineHeight.tight),
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heading: {
    fontFamily: 'Oswald_600SemiBold',
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: 'Barlow_500Medium',
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  body: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.normal),
  },
  caption: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.normal),
  },
  label: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.snug),
  },
  /** Big score / record numerals. */
  data: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: fontSize['3xl'],
    lineHeight: lh(fontSize['3xl'], lineHeight.tight),
  },
} as const;

export type TextVariant = keyof typeof textVariants;
