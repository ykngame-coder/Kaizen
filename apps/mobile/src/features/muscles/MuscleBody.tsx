import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Defs, G, Image as SvgImage, Mask, Polygon } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import greyBody from '../../../assets/muscle-body-grey.png';
import bodyMask from '../../../assets/muscle-body-mask.png';

const IMG_W = 266;
const IMG_H = 466;

/**
 * Front-view muscle shapes as polygons in the grey body's own pixel space
 * (266×466), traced to cover each muscle in full and clipped to the body
 * silhouette: shoulders (delts), chest (pecs), biceps, core (abs), quadriceps
 * and calves. Back-only groups (back, hamstrings, glutes, triceps) don't appear
 * on a front figure — they still show in the per-group list below the figure.
 */
const POLYGONS: Partial<Record<MuscleGroup, number[][][]>> = {
  shoulders: [
    [[58, 91], [90, 89], [93, 110], [68, 119], [55, 104]],
    [[174, 91], [142, 89], [139, 110], [164, 119], [177, 104]],
  ],
  chest: [
    [[90, 109], [116, 107], [116, 141], [93, 137], [87, 120]],
    [[142, 109], [116, 107], [116, 141], [139, 137], [145, 120]],
  ],
  biceps: [
    [[47, 134], [71, 138], [69, 183], [50, 181], [45, 156]],
    [[185, 134], [161, 138], [163, 183], [182, 181], [187, 156]],
  ],
  core: [[[101, 145], [131, 145], [133, 176], [128, 207], [104, 207], [99, 176]]],
  quads: [
    [[77, 249], [115, 251], [113, 321], [82, 319]],
    [[117, 251], [155, 249], [151, 319], [120, 321]],
  ],
  calves: [
    [[79, 329], [113, 331], [111, 381], [82, 379]],
    [[119, 331], [153, 329], [151, 379], [122, 381]],
  ],
};

export interface MuscleBodyProps {
  /** Fill colour for a muscle group ('transparent' → not highlighted). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
}

/**
 * Realistic muscle map: the grey anatomical body (front) with each worked muscle
 * group filled solid in its recovery-state colour across its whole shape. The
 * colour layer is clipped to the body silhouette via a luminance mask, so colour
 * fills the muscle entirely without ever bleeding onto the background.
 */
export function MuscleBody({ colorFor, width = 220 }: MuscleBodyProps): React.JSX.Element {
  const height = (width * IMG_H) / IMG_W;
  const active = (Object.keys(POLYGONS) as MuscleGroup[])
    .map((m) => ({ muscle: m, color: colorFor(m), polys: POLYGONS[m]! }))
    .filter((e) => e.color && e.color !== 'transparent');

  return (
    <View style={{ width, height }}>
      <Image source={greyBody} style={{ width, height }} resizeMode="contain" />
      <Svg width={width} height={height} viewBox={`0 0 ${IMG_W} ${IMG_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          <Mask id="bodyMask" maskUnits="userSpaceOnUse" x="0" y="0" width={IMG_W} height={IMG_H}>
            <SvgImage href={bodyMask} x={0} y={0} width={IMG_W} height={IMG_H} preserveAspectRatio="xMidYMid meet" />
          </Mask>
        </Defs>
        <G mask="url(#bodyMask)">
          {active.flatMap((e) =>
            e.polys.map((poly, i) => (
              <Polygon key={`${e.muscle}-${i}`} points={poly.map((p) => p.join(',')).join(' ')} fill={e.color} fillOpacity={0.5} />
            )),
          )}
        </G>
      </Svg>
    </View>
  );
}
