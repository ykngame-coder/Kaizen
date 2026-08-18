import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { textVariants, type TextVariant } from '@supotsu/design-system';
import { useTheme } from './theme';

type ColorRole =
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'primary'
  | 'onPrimary'
  | 'onGradient'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'accentLime'
  | 'accentData';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorRole;
}

/** Token-driven text. Typography from the design system, color from the theme. */
export function Text({
  variant = 'body',
  color = 'text',
  style,
  ...rest
}: TextProps): React.JSX.Element {
  const { colors } = useTheme();
  return <RNText style={[textVariants[variant], { color: colors[color] }, style]} {...rest} />;
}
