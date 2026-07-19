import React from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface CardProps extends ViewProps {
  elevated?: boolean;
}

/** Themed surface container used for dashboard cards (Master Prompt P28.8). */
export function Card({ elevated = false, style, ...rest }: CardProps): React.JSX.Element {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[2],
  };
  return <View style={[base, style]} {...rest} />;
}
