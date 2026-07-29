import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export interface FilterChipProps {
  label: string;
  /** Selected state — fills with the brand gradient. */
  active?: boolean;
  onPress?: () => void;
}

/**
 * A single selectable filter pill (search / list filters). Inactive: elevated
 * surface with a hairline. Active: brand gradient, white label.
 */
export function FilterChip({ label, active = false, onPress }: FilterChipProps): React.JSX.Element {
  const { colors } = useTheme();
  const inner = (
    <Text variant="caption" style={{ fontWeight: '600', color: active ? '#fff' : colors.textMuted }}>
      {label}
    </Text>
  );
  const pad = { paddingHorizontal: spacing[3], paddingVertical: spacing[2] };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      {active ? (
        <LinearGradient
          colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radii.full, ...pad }}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={{
            borderRadius: radii.full,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            ...pad,
          }}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}
