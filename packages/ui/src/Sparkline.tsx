import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from './theme';

export interface SparklineProps {
  /** Series values, oldest → newest. */
  values: number[];
  width?: number;
  height?: number;
  /** Line / fill colour. Defaults to the theme primary. */
  color?: string;
}

/**
 * Minimal trend chart: a smoothed line with a soft area fill and an emphasized
 * endpoint. Auto-scales to the series' min/max. Pure SVG, theme-aware, and
 * degrades gracefully to a flat baseline for 0–1 points.
 */
export function Sparkline({
  values,
  width = 240,
  height = 56,
  color,
}: SparklineProps): React.JSX.Element {
  const { colors } = useTheme();
  const stroke = color ?? colors.primary;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;

  const coords = values.map((v, i) => {
    const x = pad + (values.length > 1 ? (i / (values.length - 1)) * w : w / 2);
    const y = pad + h - ((v - min) / span) * h;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = coords.length
    ? `${line} L${coords[coords.length - 1]!.x.toFixed(1)} ${(pad + h).toFixed(1)} L${coords[0]!.x.toFixed(1)} ${(pad + h).toFixed(1)} Z`
    : '';
  const end = coords[coords.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {area ? <Path d={area} fill={stroke} fillOpacity={0.12} /> : null}
        {line ? <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {end ? <Circle cx={end.x} cy={end.y} r={3.5} fill={stroke} stroke={colors.surface} strokeWidth={1.5} /> : null}
      </Svg>
    </View>
  );
}
