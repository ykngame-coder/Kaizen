import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '@supotsu/design-system';

export type GradientName = keyof typeof gradients;

export interface GradientProps {
  /** A named signature gradient from the design system (default 'brand'). */
  name?: GradientName;
  /** Explicit stops, overriding `name`. */
  colors?: readonly string[];
  /** Start point (0-1 space). Default top-left → bottom-right diagonal. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  /** Fill the parent absolutely (as a background layer behind siblings). */
  fill?: boolean;
  children?: React.ReactNode;
}

type Stops = readonly [string, string, ...string[]];

/**
 * The signature gradient primitive (Kaizen Supotsu identity). Wraps
 * expo-linear-gradient with the design-system stops so brand fills stay a single
 * source of truth. Use `fill` to lay it behind content (buttons, hero cards).
 */
export function Gradient({
  name = 'brand',
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  fill = false,
  children,
}: GradientProps): React.JSX.Element {
  const stops = (colors ?? gradients[name]) as Stops;
  return (
    <LinearGradient
      colors={stops}
      start={start}
      end={end}
      style={fill ? [StyleSheet.absoluteFillObject, style] : style}
    >
      {children}
    </LinearGradient>
  );
}
