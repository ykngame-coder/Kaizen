import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { duration } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface MeterProps {
  /** Progress 0–100 (clamped). */
  value: number;
  /** Fill colour. Defaults to the theme primary. */
  color?: string;
  /** Track colour. Defaults to the elevated surface. */
  track?: string;
  /** Bar height in px. */
  height?: number;
}

/** A thin horizontal 0–100 meter (macro bars, component scores, muscle bars). */
export function Meter({ value, color, track, height = 8 }: MeterProps): React.JSX.Element {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const anim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: duration.slow, useNativeDriver: false }).start();
  }, [pct, anim]);

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: track ?? colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          height: '100%',
          backgroundColor: color ?? colors.primary,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}
