import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import { useTheme } from '@supotsu/ui';

/**
 * Stylised front/back body map (Fitbod / Bevel / Garmin Connect style). Each
 * muscle region is filled by a caller-supplied function (recovery / targeting);
 * head, hands and feet stay neutral. Schematic on purpose — recognizable,
 * theme-aware and cheap to render. Two figures share one local coordinate
 * system (0…80 wide) placed side by side via a translate.
 */
export interface BodyMapProps {
  /** Fill colour for a muscle group (freshness, targeting, …). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
}

type Shape =
  | { kind: 'ellipse'; a: [number, number, number, number] } // cx, cy, rx, ry
  | { kind: 'rect'; a: [number, number, number, number, number] } // x, y, w, h, r
  | { kind: 'path'; d: string };

// Muscle overlays in local figure coordinates (centre line at x = 40).
const FRONT: [MuscleGroup, Shape][] = [
  ['shoulders', { kind: 'ellipse', a: [19, 50, 8, 7] }],
  ['shoulders', { kind: 'ellipse', a: [61, 50, 8, 7] }],
  ['chest', { kind: 'path', d: 'M28 55 Q40 52 40 55 L40 68 Q34 71 28 67 Z' }],
  ['chest', { kind: 'path', d: 'M52 55 Q40 52 40 55 L40 68 Q46 71 52 67 Z' }],
  ['biceps', { kind: 'ellipse', a: [13, 66, 5, 12] }],
  ['biceps', { kind: 'ellipse', a: [67, 66, 5, 12] }],
  ['core', { kind: 'rect', a: [33, 70, 14, 24, 4] }],
  ['quads', { kind: 'ellipse', a: [31, 140, 8, 26] }],
  ['quads', { kind: 'ellipse', a: [49, 140, 8, 26] }],
];

const BACK: [MuscleGroup, Shape][] = [
  ['back', { kind: 'path', d: 'M27 52 Q40 49 53 52 L50 82 Q40 86 30 82 Z' }],
  ['triceps', { kind: 'ellipse', a: [13, 66, 5, 12] }],
  ['triceps', { kind: 'ellipse', a: [67, 66, 5, 12] }],
  ['glutes', { kind: 'ellipse', a: [32, 112, 9, 10] }],
  ['glutes', { kind: 'ellipse', a: [48, 112, 9, 10] }],
  ['hamstrings', { kind: 'ellipse', a: [31, 148, 8, 22] }],
  ['hamstrings', { kind: 'ellipse', a: [49, 148, 8, 22] }],
  ['calves', { kind: 'ellipse', a: [31, 190, 6, 16] }],
  ['calves', { kind: 'ellipse', a: [49, 190, 6, 16] }],
];

// Grey silhouette (torso + limbs), local coords. Head/hands/feet drawn separately.
const TORSO = 'M22 48 Q18 46 20 62 L24 92 Q26 106 32 110 L48 110 Q54 106 56 92 L60 62 Q62 46 58 48 Q49 44 40 44 Q31 44 22 48 Z';
const ARM_L = 'M18 48 Q9 50 9 66 L11 96 Q12 104 16 104 L20 104 L20 52 Z';
const ARM_R = 'M62 48 Q71 50 71 66 L69 96 Q68 104 64 104 L60 104 L60 52 Z';
const LEG_L = 'M25 110 L38 110 L37 168 L34 208 L27 208 L24 168 Z';
const LEG_R = 'M42 110 L55 110 L56 168 L53 208 L46 208 L43 168 Z';

export function BodyMap({ colorFor, width = 300 }: BodyMapProps): React.JSX.Element {
  const { colors } = useTheme();
  const limb = colors.surfaceElevated;
  const stroke = colors.border;
  const skin = colors.textSubtle;

  const renderShape = ([muscle, s]: [MuscleGroup, Shape], i: number): React.JSX.Element => {
    const fill = colorFor(muscle);
    if (s.kind === 'ellipse') {
      const [cx, cy, rx, ry] = s.a;
      return <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />;
    }
    if (s.kind === 'rect') {
      const [x, y, w, h, r] = s.a;
      return <Rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={fill} />;
    }
    return <Path key={i} d={s.d} fill={fill} />;
  };

  // One figure: grey silhouette + muscle overlays, positioned by the parent G.
  const figure = (muscles: [MuscleGroup, Shape][]): React.JSX.Element => (
    <G>
      {/* Neutral base silhouette */}
      <Path d={ARM_L} fill={limb} stroke={stroke} strokeWidth={0.5} />
      <Path d={ARM_R} fill={limb} stroke={stroke} strokeWidth={0.5} />
      <Path d={LEG_L} fill={limb} stroke={stroke} strokeWidth={0.5} />
      <Path d={LEG_R} fill={limb} stroke={stroke} strokeWidth={0.5} />
      <Path d={TORSO} fill={limb} stroke={stroke} strokeWidth={0.5} />
      {/* Head / neck / hands / feet stay skin-neutral */}
      <Circle cx={40} cy={24} r={12} fill={skin} />
      <Rect x={36} y={34} width={8} height={8} fill={skin} />
      <Circle cx={11} cy={108} r={4} fill={skin} />
      <Circle cx={69} cy={108} r={4} fill={skin} />
      <Ellipse cx={30} cy={212} rx={5} ry={4} fill={skin} />
      <Ellipse cx={50} cy={212} rx={5} ry={4} fill={skin} />
      {/* Muscle overlays */}
      {muscles.map(renderShape)}
    </G>
  );

  return (
    <Svg width={width} height={width * (260 / 220)} viewBox="0 0 220 260">
      <G transform="translate(10 12)">{figure(FRONT)}</G>
      <G transform="translate(130 12)">{figure(BACK)}</G>
    </Svg>
  );
}
