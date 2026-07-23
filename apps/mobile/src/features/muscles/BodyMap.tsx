import React from 'react';
import Svg, { Circle, Ellipse, Rect, G } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import { useTheme } from '@supotsu/ui';

/**
 * Stylised front/back body map (Fitbod / Garmin Connect style). Muscle regions
 * are coloured by a caller-supplied function (e.g. training freshness). Kept
 * schematic on purpose — recognizable, theme-aware, and cheap to render.
 */
export interface BodyMapProps {
  /** Fill colour for a muscle group (fatigue/freshness, targeting, …). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
}

interface Shape {
  muscle: MuscleGroup;
  kind: 'ellipse' | 'rect';
  // ellipse: [cx, cy, rx, ry] · rect: [x, y, w, h, r]
  a: number[];
}

// Front figure centred on x≈85; back figure centred on x≈255 (offset +170).
const FRONT: Shape[] = [
  { muscle: 'shoulders', kind: 'ellipse', a: [60, 50, 9, 7] },
  { muscle: 'shoulders', kind: 'ellipse', a: [110, 50, 9, 7] },
  { muscle: 'chest', kind: 'ellipse', a: [76, 63, 9, 8] },
  { muscle: 'chest', kind: 'ellipse', a: [94, 63, 9, 8] },
  { muscle: 'biceps', kind: 'ellipse', a: [50, 74, 6, 12] },
  { muscle: 'biceps', kind: 'ellipse', a: [120, 74, 6, 12] },
  { muscle: 'core', kind: 'rect', a: [72, 76, 26, 30, 6] },
  { muscle: 'quads', kind: 'ellipse', a: [75, 142, 8, 26] },
  { muscle: 'quads', kind: 'ellipse', a: [95, 142, 8, 26] },
];

const BACK: Shape[] = [
  { muscle: 'back', kind: 'ellipse', a: [255, 60, 18, 20] },
  { muscle: 'triceps', kind: 'ellipse', a: [220, 74, 6, 12] },
  { muscle: 'triceps', kind: 'ellipse', a: [290, 74, 6, 12] },
  { muscle: 'glutes', kind: 'ellipse', a: [248, 116, 9, 9] },
  { muscle: 'glutes', kind: 'ellipse', a: [262, 116, 9, 9] },
  { muscle: 'hamstrings', kind: 'ellipse', a: [245, 148, 8, 22] },
  { muscle: 'hamstrings', kind: 'ellipse', a: [265, 148, 8, 22] },
  { muscle: 'calves', kind: 'ellipse', a: [245, 188, 6, 16] },
  { muscle: 'calves', kind: 'ellipse', a: [265, 188, 6, 16] },
];

export function BodyMap({ colorFor, width = 320 }: BodyMapProps): React.JSX.Element {
  const { colors } = useTheme();
  const body = colors.surfaceElevated;
  const stroke = colors.border;

  const renderShape = (s: Shape, i: number): React.JSX.Element => {
    const fill = colorFor(s.muscle);
    if (s.kind === 'ellipse') {
      const [cx, cy, rx, ry] = s.a;
      return <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />;
    }
    const [x, y, w, h, r] = s.a;
    return <Rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={fill} />;
  };

  /** Grey background silhouette (head, torso, arms, legs) for a figure at cx. */
  const figure = (cx: number): React.JSX.Element => (
    <G>
      <Circle cx={cx} cy={22} r={13} fill={body} stroke={stroke} strokeWidth={1} />
      <Rect x={cx - 22} y={40} width={44} height={70} rx={16} fill={body} />
      <Rect x={cx - 41} y={48} width={13} height={58} rx={6} fill={body} />
      <Rect x={cx + 28} y={48} width={13} height={58} rx={6} fill={body} />
      <Rect x={cx - 17} y={108} width={15} height={100} rx={7} fill={body} />
      <Rect x={cx + 2} y={108} width={15} height={100} rx={7} fill={body} />
    </G>
  );

  return (
    <Svg width={width} height={width * 0.72} viewBox="0 0 340 240">
      {figure(85)}
      {figure(255)}
      {FRONT.map(renderShape)}
      {BACK.map(renderShape)}
    </Svg>
  );
}
