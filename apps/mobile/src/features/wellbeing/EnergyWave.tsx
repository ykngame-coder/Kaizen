import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, useTheme } from '@supotsu/ui';
import type { EnergyPoint } from '@supotsu/engines';

const parseHHMM = (t: string): number => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Cosine ease between 0 and 1 — smooth "S" transition instead of a linear ramp. */
const ease = (t: number): number => (1 - Math.cos(t * Math.PI)) / 2;

/** Densely-sampled points between each control point, linear in time / eased in energy, for an actual wave instead of connect-the-dots. */
function sampleWave(points: { x: number; y: number }[], samplesPerSegment: number): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let s = i === 0 ? 0 : 1; s <= samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * ease(t) });
    }
  }
  return out;
}

export interface EnergyWaveProps {
  points: EnergyPoint[];
  width?: number;
  height?: number;
}

/**
 * Wavy energy timeline (Rythme circadien) — alertness across the waking day,
 * peaks/dips called out with a marker + label, real clock time on the x-axis.
 */
export function EnergyWave({ points, width = 320, height = 160 }: EnergyWaveProps): React.JSX.Element {
  const { colors } = useTheme();
  if (points.length < 2) return <View />;

  const padX = 8;
  const padTop = 34;
  const padBottom = 22;
  const w = width - padX * 2;
  const h = height - padTop - padBottom;

  const t0 = parseHHMM(points[0]!.time);
  const t1 = parseHHMM(points[points.length - 1]!.time);
  const span = Math.max(1, t1 - t0);

  const coords = points.map((p) => ({
    x: padX + ((parseHHMM(p.time) - t0) / span) * w,
    y: padTop + h - p.energy * h,
  }));

  const dense = sampleWave(coords, 14);
  const line = dense.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${dense[dense.length - 1]!.x.toFixed(1)} ${(padTop + h).toFixed(1)} L${dense[0]!.x.toFixed(1)} ${(padTop + h).toFixed(1)} Z`;

  const markers = points
    .map((p, i) => ({ p, c: coords[i]! }))
    .filter(({ p }) => p.kind);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={area} fill={colors.primary} fillOpacity={0.12} />
        <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {markers.map(({ p, c }, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={4} fill={p.kind === 'peak' ? colors.accentData : colors.warning} stroke={colors.surface} strokeWidth={1.5} />
        ))}
      </Svg>
      {/* Labels positioned over the SVG — easier to lay out as RN Text than SVG text/tspan wrapping. */}
      {markers.map(({ p, c }, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: Math.min(Math.max(c.x - 46, 0), width - 92),
            top: c.y - padTop + 2,
            width: 92,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12 }}>{p.kind === 'peak' ? '☀️' : '🌙'}</Text>
          <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', lineHeight: 13 }}>
            {p.label}
          </Text>
          <Text variant="caption" style={{ fontWeight: '700', color: p.kind === 'peak' ? colors.accentData : colors.warning }}>
            {p.time}
          </Text>
        </View>
      ))}
      <View style={{ position: 'absolute', bottom: 0, left: padX, right: padX, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textSubtle">{points[0]!.time}</Text>
        <Text variant="caption" color="textSubtle">{points[points.length - 1]!.time}</Text>
      </View>
    </View>
  );
}
