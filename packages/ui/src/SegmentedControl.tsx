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
            // Style STATIQUE sur le Pressable, apparence et retour au toucher
            // sur la View intérieure — le schéma de Button. Passé en
            // style-fonction (`style={({ pressed }) => …}`), tout le style
            // était perdu dans l'app : fond, bordure, marges et largeur, et
            // les onglets Défis / Classement de Communauté ne ressemblaient
            // plus qu'à deux mots.
            style={{ flexGrow: vertical ? 0 : 1 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                  borderColor: selected ? colors.primary : colors.border,
                  borderWidth: 1,
                  borderRadius: radii.md,
                  paddingVertical: spacing[3],
                  paddingHorizontal: spacing[4],
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                }}
              >
                <Text variant="subtitle" color={selected ? 'onPrimary' : 'text'}>
                  {option.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
