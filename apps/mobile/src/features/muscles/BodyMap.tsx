import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import { useTheme } from '@supotsu/ui';

/**
 * Anatomical front/back body map (Fitbod / Bevel / Garmin Connect style). Each
 * muscle group is filled by a caller-supplied function (recovery / targeting);
 * head, hands and feet stay neutral, and faint definition lines suggest the
 * musculature. Two figures share one local coordinate system (centre line at
 * x = 40, ~0…214 tall) placed side by side via a translate. Theme-aware and
 * pure SVG, so it renders identically on iOS/Android/web.
 */
export interface BodyMapProps {
  /** Fill colour for a muscle group (freshness, targeting, …). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
  /** 'both' shows front + back side by side; 'front'/'back' a single figure. */
  view?: 'front' | 'back' | 'both';
}

// Grey silhouette (head, neck, torso, arms, legs), local coords.
const HEAD: [number, number, number, number] = [40, 16, 9, 11];
const SILHOUETTE = [
  'M35 25 L45 25 L44 34 L36 34 Z', // neck
  'M19 40 C15 43 15 54 17 66 L20 88 C21 98 26 105 33 107 L47 107 C54 105 59 98 60 88 L63 66 C65 54 65 43 61 40 C52 35 28 35 19 40 Z', // torso
  'M18 41 C9 44 7 55 8 66 L11 86 C11 94 13 101 16 103 L21 103 L21 86 C19 74 18 54 21 44 Z', // arm L
  'M62 41 C71 44 73 55 72 66 L69 86 C69 94 67 101 64 103 L59 103 L59 86 C61 74 62 54 59 44 Z', // arm R
  'M24 107 L38 107 L37 150 C37 162 35 172 33 182 L31 208 L25 208 L23 182 C22 172 24 162 24 150 Z', // leg L
  'M56 107 L42 107 L43 150 C43 162 45 172 47 182 L49 208 L55 208 L57 182 C58 172 56 162 56 150 Z', // leg R
];
// Skin-neutral extremities: hands (circles) and feet (ellipses).
const HANDS: [number, number, number][] = [
  [13, 105, 4],
  [67, 105, 4],
];
const FEET: [number, number, number, number][] = [
  [28, 210, 5, 4],
  [52, 210, 5, 4],
];

// Muscle overlays: [group, path]. Grey (rested) fills blend into the silhouette.
const FRONT: [MuscleGroup, string][] = [
  ['shoulders', 'M13 43 C10 49 11 57 17 59 C21 58 23 51 21 45 C19 41 15 41 13 43 Z'],
  ['shoulders', 'M67 43 C70 49 69 57 63 59 C59 58 57 51 59 45 C61 41 65 41 67 43 Z'],
  ['chest', 'M23 48 C29 45 37 46 39 51 L39 60 C38 64 31 66 26 63 C21 60 20 51 23 48 Z'],
  ['chest', 'M57 48 C51 45 43 46 41 51 L41 60 C42 64 49 66 54 63 C59 60 60 51 57 48 Z'],
  ['biceps', 'M13 61 C10 65 10 76 14 80 C17 80 18 75 18 69 C18 64 16 61 13 61 Z'],
  ['biceps', 'M67 61 C70 65 70 76 66 80 C63 80 62 75 62 69 C62 64 64 61 67 61 Z'],
  ['core', 'M34 64 C33 64 33 66 33 69 L33 90 C33 95 36 98 40 98 C44 98 47 95 47 90 L47 69 C47 66 47 64 46 64 Z'],
  ['quads', 'M27 110 C24 117 24 140 29 150 C32 152 35 149 36 143 L36 116 C35 111 30 108 27 110 Z'],
  ['quads', 'M53 110 C56 117 56 140 51 150 C48 152 45 149 44 143 L44 116 C45 111 50 108 53 110 Z'],
];
const BACK: [MuscleGroup, string][] = [
  ['shoulders', 'M13 43 C10 49 11 57 17 59 C21 58 23 51 21 45 C19 41 15 41 13 43 Z'],
  ['shoulders', 'M67 43 C70 49 69 57 63 59 C59 58 57 51 59 45 C61 41 65 41 67 43 Z'],
  ['back', 'M40 43 C46 43 53 46 54 53 L52 63 C51 69 47 78 44 83 L40 86 L36 83 C33 78 29 69 28 63 L26 53 C27 46 34 43 40 43 Z'],
  ['triceps', 'M13 61 C10 65 10 77 14 81 C17 81 18 76 18 70 C18 65 16 61 13 61 Z'],
  ['triceps', 'M67 61 C70 65 70 77 66 81 C63 81 62 76 62 70 C62 65 64 61 67 61 Z'],
  ['glutes', 'M28 104 C24 106 24 116 29 120 C34 122 39 119 39 113 C39 107 34 102 28 104 Z'],
  ['glutes', 'M52 104 C56 106 56 116 51 120 C46 122 41 119 41 113 C41 107 46 102 52 104 Z'],
  ['hamstrings', 'M28 124 C25 130 25 148 30 158 C33 160 36 157 36 150 L36 128 C35 124 31 123 28 124 Z'],
  ['hamstrings', 'M52 124 C55 130 55 148 50 158 C47 160 44 157 44 150 L44 128 C45 124 49 123 52 124 Z'],
  ['calves', 'M29 166 C26 172 27 186 31 192 C34 192 36 185 36 178 C36 172 33 166 29 166 Z'],
  ['calves', 'M51 166 C54 172 53 186 49 192 C46 192 44 185 44 178 C44 172 47 166 51 166 Z'],
];
// Decorative definition lines drawn on top (linea alba, ab cuts, sternum / spine).
const FRONT_DETAIL = ['M40 64 L40 97', 'M33 72 L47 72', 'M33 80 L47 80', 'M33 88 L47 88', 'M40 48 L40 62'];
const BACK_DETAIL = ['M40 45 L40 85'];

export function BodyMap({ colorFor, width = 300, view = 'both' }: BodyMapProps): React.JSX.Element {
  const { colors } = useTheme();
  const limb = colors.surfaceElevated;
  const stroke = colors.border;
  const skin = colors.textSubtle;

  const figure = (
    muscles: [MuscleGroup, string][],
    detail: string[],
    tx: number,
  ): React.JSX.Element => (
    <G transform={`translate(${tx} 8)`}>
      <Ellipse cx={HEAD[0]} cy={HEAD[1]} rx={HEAD[2]} ry={HEAD[3]} fill={limb} stroke={stroke} strokeWidth={0.5} />
      {SILHOUETTE.map((d, i) => (
        <Path key={`s${i}`} d={d} fill={limb} stroke={stroke} strokeWidth={0.5} />
      ))}
      {HANDS.map(([cx, cy, r], i) => (
        <Circle key={`h${i}`} cx={cx} cy={cy} r={r} fill={skin} />
      ))}
      {FEET.map(([cx, cy, rx, ry], i) => (
        <Ellipse key={`f${i}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={skin} />
      ))}
      {muscles.map(([muscle, d], i) => (
        <Path key={`m${i}`} d={d} fill={colorFor(muscle)} />
      ))}
      {detail.map((d, i) => (
        <Path key={`d${i}`} d={d} stroke={colors.background} strokeWidth={0.9} strokeOpacity={0.55} strokeLinecap="round" fill="none" />
      ))}
    </G>
  );

  if (view !== 'both') {
    // Single figure, centred in an 82×226 viewBox (one body + margin).
    return (
      <Svg width={width} height={width * (226 / 82)} viewBox="0 0 82 226">
        {view === 'front' ? figure(FRONT, FRONT_DETAIL, 8) : figure(BACK, BACK_DETAIL, 8)}
      </Svg>
    );
  }

  return (
    <Svg width={width} height={width * (240 / 220)} viewBox="0 0 220 240">
      {figure(FRONT, FRONT_DETAIL, 8)}
      {figure(BACK, BACK_DETAIL, 128)}
    </Svg>
  );
}
