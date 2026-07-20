import React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
}

/** Themed text field with label and error, token-driven (Master Prompt P47.7). */
export function Input({ label, error, ...rest }: InputProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[1] }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label.toUpperCase()}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textSubtle}
        style={{
          color: colors.text,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: error ? colors.error : colors.border,
          borderRadius: radii.md,
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[4],
          fontSize: 16,
        }}
        {...rest}
      />
      {error ? (
        <Text variant="caption" style={{ color: colors.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
