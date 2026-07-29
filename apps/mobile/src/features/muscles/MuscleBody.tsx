import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import greyBody from '../../../assets/muscle-body-grey.png';

const IMG_W = 266;
const IMG_H = 466;

interface Region {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Front-view muscle regions in the grey body's own pixel space (266×466),
 * traced from the coloured reference: shoulders (delts), chest (pecs), biceps,
 * core (abs + obliques), quadriceps and calves. Back-only groups (back,
 * hamstrings, glutes, triceps) don't appear on a front figure — they still show
 * in the per-group list below the figure.
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
 * group softly lit in its recovery-state colour via radial-gradient overlays,
 * aligned to the figure's own coordinate space.
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
          {active.map((e) => (
            <RadialGradient key={e.muscle} id={`mg-${e.muscle}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={e.color} stopOpacity={0.9} />
              <Stop offset="0.65" stopColor={e.color} stopOpacity={0.5} />
              <Stop offset="1" stopColor={e.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {active.flatMap((e) =>
          e.regions.map((r, i) => (
            <Ellipse key={`${e.muscle}-${i}`} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill={`url(#mg-${e.muscle})`} />
          )),
        )}
      </Svg>
    </View>
  );
}
