import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Defs, Ellipse, G, Image as SvgImage, Mask } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import greyBody from '../../../assets/muscle-body-grey.png';
import bodyMask from '../../../assets/muscle-body-mask.png';

const IMG_W = 266;
const IMG_H = 466;

interface Region {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Front-view muscle regions in the grey body's own pixel space (266×466), traced
 * from the coloured reference and the figure's real edges (body centre x=116):
 * shoulders (delts), chest (pecs), biceps, core (abs), quadriceps and calves.
 * Back-only groups (back, hamstrings, glutes, triceps) don't appear on a front
 * figure — they still show in the per-group list below the figure.
 */
const REGIONS: Partial<Record<MuscleGroup, Region[]>> = {
  shoulders: [
    { cx: 73, cy: 102, rx: 18, ry: 15 },
    { cx: 159, cy: 102, rx: 18, ry: 15 },
  ],
  chest: [
    { cx: 100, cy: 122, rx: 22, ry: 17 },
    { cx: 132, cy: 122, rx: 22, ry: 17 },
  ],
  biceps: [
    { cx: 60, cy: 153, rx: 13, ry: 22 },
    { cx: 172, cy: 153, rx: 13, ry: 22 },
  ],
  core: [
    { cx: 116, cy: 162, rx: 20, ry: 20 },
    { cx: 116, cy: 196, rx: 24, ry: 16 },
  ],
  quads: [
    { cx: 95, cy: 283, rx: 20, ry: 46 },
    { cx: 138, cy: 283, rx: 20, ry: 46 },
  ],
  calves: [
    { cx: 92, cy: 353, rx: 14, ry: 29 },
    { cx: 141, cy: 353, rx: 14, ry: 29 },
  ],
};

export interface MuscleBodyProps {
  /** Fill colour for a muscle group ('transparent' → not highlighted). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
}

/**
 * Realistic muscle map: the grey anatomical body (front) with each worked muscle
 * group filled solid in its recovery-state colour. The whole colour layer is
 * clipped to the body silhouette via a luminance mask, so colour never bleeds
 * onto the background — a clean fill, not an airbrushed blob.
 */
export function MuscleBody({ colorFor, width = 220 }: MuscleBodyProps): React.JSX.Element {
  const height = (width * IMG_H) / IMG_W;
  const active = (Object.keys(REGIONS) as MuscleGroup[])
    .map((m) => ({ muscle: m, color: colorFor(m), regions: REGIONS[m]! }))
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
            e.regions.map((r, i) => (
              <Ellipse key={`${e.muscle}-${i}`} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill={e.color} fillOpacity={0.55} />
            )),
          )}
        </G>
      </Svg>
    </View>
  );
}
