import React from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
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

  // The visual (background/padding/radius) lives on an inner View with a plain
  // *object* style. NativeWind (jsxImportSource) drops backgroundColor when the
  // style is passed as a *function* to Pressable — object styles are honored
  // (same reason Input renders its background). So Pressable stays layout-only
  // and the View carries the fill.
  const fillStyle: ViewStyle = {
    backgroundColor: bg[variant],
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }}
      {...rest}
    >
      {({ pressed }) => (
        <View style={{ ...fillStyle, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }}>
          <Text variant="subtitle" color={fg[variant]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
