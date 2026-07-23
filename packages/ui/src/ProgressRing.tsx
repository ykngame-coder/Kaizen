import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ProgressRingProps {
  /** Progress 0–100. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width of the ring. */
  thickness?: number;
  /** Arc colour. Defaults to the theme primary. */
  color?: string;
  /** Big number in the centre (defaults to the rounded value). */
  centerLabel?: string;
  /** Small caption under the centre number. */
  caption?: string;
}

/**
 * Circular progress gauge (Garmin Connect / Bevel style). A coloured arc fills
 * clockwise from the top over a neutral track, with a value + caption centred.
 * Built on react-native-svg so it renders identically on iOS/Android/web.
 */
export function ProgressRing({
  value,
  size = 128,
  thickness = 10,
  color,
  centerLabel,
  caption,
}: ProgressRingProps): React.JSX.Element {
  const { colors } = useTheme();
  const arc = color ?? colors.primary;
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cx} r={r} stroke={colors.surfaceElevated} strokeWidth={thickness} fill="none" />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={arc}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // Start at 12 o'clock and go clockwise.
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <Text variant="data">{centerLabel ?? String(Math.round(pct))}</Text>
      {caption ? (
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
