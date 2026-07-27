import React from 'react';
import { View } from 'react-native';
import { useTheme } from './theme';

export interface MeterProps {
  /** Progress 0–100 (clamped). */
  value: number;
  /** Fill colour. Defaults to the theme primary. */
  color?: string;
  /** Track colour. Defaults to the elevated surface. */
  track?: string;
  /** Bar height in px. */
  height?: number;
}

/** A thin horizontal 0–100 meter (macro bars, component scores, muscle bars). */
export function Meter({ value, color, track, height = 8 }: MeterProps): React.JSX.Element {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: track ?? colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: color ?? colors.primary,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}
