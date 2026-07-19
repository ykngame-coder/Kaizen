import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

/** Compact status pill (Master Prompt P28 state colors). */
export function Badge({ label, tone = 'neutral' }: BadgeProps): React.JSX.Element {
  const { colors } = useTheme();
  const toneColor: Record<BadgeTone, string> = {
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
    neutral: colors.textMuted,
  };
  const color = toneColor[tone];

  const style: ViewStyle = {
    alignSelf: 'flex-start',
    backgroundColor: `${color}22`,
    borderRadius: radii.full,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
  };

  return (
    <View style={style}>
      <Text variant="label" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
