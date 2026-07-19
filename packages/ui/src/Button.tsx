import React from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quick' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/** Action hierarchy from the design system (Master Prompt P28.9, P47.7). */
export function Button({
  label,
  variant = 'primary',
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  const { colors } = useTheme();

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceElevated,
    quick: colors.accentEndurance,
    danger: colors.error,
  };
  const fg: Record<ButtonVariant, 'onPrimary' | 'text'> = {
    primary: 'onPrimary',
    secondary: 'text',
    quick: 'onPrimary',
    danger: 'onPrimary',
  };

  const style: ViewStyle = {
    backgroundColor: bg[variant],
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
      {...rest}
    >
      <Text variant="subtitle" color={fg[variant]}>
        {label}
      </Text>
    </Pressable>
  );
}
