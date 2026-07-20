import React from 'react';
import { Pressable, View } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipMultiSelectProps {
  options: readonly ChipOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

/** Multi-select chip row for sports / equipment (Master Prompt P17.2). */
export function ChipMultiSelect({
  options,
  values,
  onChange,
}: ChipMultiSelectProps): React.JSX.Element {
  const { colors } = useTheme();
  const toggle = (value: string): void => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={() => toggle(option.value)}
            style={{
              backgroundColor: selected ? colors.primary : colors.surfaceElevated,
              borderColor: selected ? colors.primary : colors.border,
              borderWidth: 1,
              borderRadius: radii.full,
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[4],
            }}
          >
            <Text variant="caption" color={selected ? 'onPrimary' : 'text'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
