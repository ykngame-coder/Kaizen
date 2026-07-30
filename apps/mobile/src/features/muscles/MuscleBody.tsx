import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { MuscleGroup } from '@supotsu/core';
import { useTheme } from '@supotsu/ui';
import { bodyBack, bodyFront, type BodyPart } from './bodyData';

/** Map body-highlighter slugs to our recovery muscle groups. Non-muscle parts
 * (head, hands, feet, joints…) are absent → rendered as the neutral body. */
const SLUG_TO_MUSCLE: Record<string, MuscleGroup> = {
  chest: 'chest',
  deltoids: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'biceps',
  abs: 'core',
  obliques: 'core',
  quadriceps: 'quads',
  adductors: 'quads',
  calves: 'calves',
  tibialis: 'calves',
  trapezius: 'back',
  'upper-back': 'back',
  'lower-back': 'back',
  gluteal: 'glutes',
  hamstring: 'hamstrings',
};

const VIEW = { w: 1448, h: 1448 };

export interface MuscleBodyProps {
  /** Fill colour for a muscle group ('transparent' → use the neutral body). */
  colorFor: (muscle: MuscleGroup) => string;
  width?: number;
  /** Called with the muscle group when its shape is tapped. */
  onSelect?: (muscle: MuscleGroup) => void;
}

/**
 * Anatomical muscle map — front + back figures with every muscle traced as its
 * own vector shape (react-native-body-highlighter data, MIT). Worked muscles are
 * filled in their recovery-state colour; everything else stays a neutral grey
 * body. Crisp at any size, no raster overlays.
 */
export function MuscleBody({ colorFor, width = 320, onSelect }: MuscleBodyProps): React.JSX.Element {
  const { colors } = useTheme();
  const height = (width * VIEW.h) / VIEW.w;
  const BASE = '#38495a'; // neutral body fill on dark bg
  const LINE = '#0a121b'; // muscle-separation stroke (≈ background)

  const parts: BodyPart[] = [...bodyFront, ...bodyBack];

  const fillFor = (part: BodyPart): string => {
    const muscle = part.slug ? SLUG_TO_MUSCLE[part.slug] : undefined;
    if (!muscle) return BASE;
    const c = colorFor(muscle);
    return c && c !== 'transparent' ? c : BASE;
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}>
        {parts.map((part, pi) => {
          const fill = fillFor(part);
          const muscle = part.slug ? SLUG_TO_MUSCLE[part.slug] : undefined;
          const press = onSelect && muscle ? () => onSelect(muscle) : undefined;
          const ds = [...(part.path?.common ?? []), ...(part.path?.left ?? []), ...(part.path?.right ?? [])];
          return ds.map((d, di) => (
            <Path key={`${pi}-${di}`} d={d} fill={fill} stroke={LINE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPress={press} />
          ));
        })}
      </Svg>
    </View>
  );
}
