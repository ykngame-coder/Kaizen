import React from 'react';
import { Pressable, View } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Stack vertically instead of a single row (for longer label lists). */
  vertical?: boolean;
}

/** Single-select choice control for onboarding steps (Master Prompt P17.2). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  vertical = false,
}: SegmentedControlProps<T>): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: vertical ? 'column' : 'row',
        flexWrap: vertical ? 'nowrap' : 'wrap',
        gap: spacing[2],
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flexGrow: vertical ? 0 : 1,
              backgroundColor: selected ? colors.primary : colors.surfaceElevated,
              borderColor: selected ? colors.primary : colors.border,
              borderWidth: 1,
              borderRadius: radii.md,
              paddingVertical: spacing[3],
              paddingHorizontal: spacing[4],
              alignItems: 'center',
            }}
          >
            <Text variant="subtitle" color={selected ? 'onPrimary' : 'text'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
