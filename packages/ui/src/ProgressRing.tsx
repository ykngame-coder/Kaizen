import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { gradients } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

/** One coloured zone of a multi-segment gauge; `weight` sets its share. */
export interface RingSegment {
  color: string;
  weight?: number;
}

export interface ProgressRingProps {
  /** Progress / position 0–100. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width of the ring. */
  thickness?: number;
  /** Arc colour in single-arc mode. Defaults to the theme primary. */
  color?: string;
  /**
   * Multi-segment mode (Garmin Connect style): the ring is drawn as coloured
   * zones and a marker dot sits at `value`. When omitted, a single arc fills
   * clockwise from the top instead.
   */
  segments?: RingSegment[];
  /**
   * Fill the single arc with the premium blue→purple gradient instead of a flat
   * colour. Pass a custom two-stop array to override. Ignored in segment mode.
   */
  gradient?: boolean | readonly [string, string];
  /** Big number in the centre (defaults to the rounded value). */
  centerLabel?: string;
  /** Small caption under the centre number. */
  caption?: string;
}

let ringGradientSeq = 0;

/**
 * Circular gauge (Garmin Connect / Bevel style). Either a single arc that fills
 * clockwise from the top, or a multi-segment scale of coloured zones with a
 * marker dot at the current value. Built on react-native-svg so it renders
 * identically on iOS/Android/web.
 */
export function ProgressRing({
  value,
  size = 128,
  thickness = 10,
  color,
  segments,
  gradient,
  centerLabel,
  caption,
}: ProgressRingProps): React.JSX.Element {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const gradId = React.useMemo(() => `ring-grad-${(ringGradientSeq += 1)}`, []);
  const gradStops = gradient
    ? Array.isArray(gradient)
      ? gradient
      : (gradients.brand.slice(0, 2) as [string, string])
    : null;

  let ring: React.JSX.Element[];
  if (segments && segments.length > 0) {
    const total = segments.reduce((acc, s) => acc + (s.weight ?? 1), 0);
    const gap = Math.min(circumference * 0.02, 5);
    ring = [];
    let start = 0;
    segments.forEach((s, i) => {
      const arc = ((s.weight ?? 1) / total) * circumference;
      const drawn = Math.max(0.5, arc - gap);
      ring.push(
        <Circle
          key={i}
          cx={cx}
          cy={cx}
          r={r}
          stroke={s.color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${drawn} ${circumference - drawn}`}
          strokeDashoffset={-start}
          transform={`rotate(-90 ${cx} ${cx})`}
        />,
      );
      start += arc;
    });
    // Marker dot at the value position (clockwise from 12 o'clock).
    const angle = ((-90 + (pct / 100) * 360) * Math.PI) / 180;
    ring.push(
      <Circle
        key="marker"
        cx={cx + r * Math.cos(angle)}
        cy={cx + r * Math.sin(angle)}
        r={thickness * 0.62}
        fill={colors.text}
        stroke={colors.surface}
        strokeWidth={2}
      />,
    );
  } else {
    const dash = (pct / 100) * circumference;
    ring = [
      <Circle
        key="arc"
        cx={cx}
        cy={cx}
        r={r}
        stroke={gradStops ? `url(#${gradId})` : (color ?? colors.primary)}
        strokeWidth={thickness}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${cx} ${cx})`}
      />,
    ];
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {gradStops ? (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradStops[0]} />
              <Stop offset="1" stopColor={gradStops[1]} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle cx={cx} cy={cx} r={r} stroke={colors.surfaceElevated} strokeWidth={thickness} fill="none" />
        {ring}
      </Svg>
      <Text
        variant="data"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: Math.max(12, Math.round(size * 0.24)), maxWidth: size - thickness * 2 }}
      >
        {centerLabel ?? String(Math.round(pct))}
      </Text>
      {caption ? (
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
