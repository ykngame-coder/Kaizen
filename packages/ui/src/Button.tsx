import React from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { Gradient } from './Gradient';
import { useTheme } from './theme';
import { triggerHaptic } from './haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'quick' | 'danger' | 'gradient';

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
  onPress,
  ...rest
}: ButtonProps): React.JSX.Element {
  const { colors } = useTheme();

  // Primary is the mockup's signature gradient pill; `gradient` is an explicit
  // alias. Both fill with the brand gradient and use a fully-rounded shape.
  const isGradient = variant === 'gradient' || variant === 'primary';
  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceElevated,
    quick: colors.accentEndurance,
    danger: colors.error,
    gradient: 'transparent',
  };
  const fg: Record<ButtonVariant, 'onPrimary' | 'text'> = {
    primary: 'onPrimary',
    secondary: 'text',
    quick: 'onPrimary',
    danger: 'onPrimary',
    gradient: 'onPrimary',
  };

  // The visual (background/padding/radius) lives on an inner View with a plain
  // *object* style. NativeWind (jsxImportSource) drops backgroundColor when the
  // style is passed as a *function* to Pressable — object styles are honored
  // (same reason Input renders its background). So Pressable stays layout-only
  // and the View carries the fill.
  // Gradient CTAs are fully-rounded pills (mockup); solid variants use md radius.
  const fillStyle: ViewStyle = {
    backgroundColor: bg[variant],
    borderRadius: isGradient ? radii.full : radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const content = (
    <Text variant="subtitle" color={fg[variant]}>
      {label}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }}
      onPress={(e) => {
        triggerHaptic();
        onPress?.(e);
      }}
      {...rest}
    >
      {({ pressed }) => {
        const opacity = disabled ? 0.5 : pressed ? 0.85 : 1;
        if (isGradient) {
          return (
            <View style={{ ...fillStyle, opacity }}>
              <Gradient fill start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              {content}
            </View>
          );
        }
        return <View style={{ ...fillStyle, opacity }}>{content}</View>;
      }}
    </Pressable>
  );
}
