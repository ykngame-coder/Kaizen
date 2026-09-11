import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { SetEntry } from '@supotsu/core';

export interface MovementChecklistProps {
  sets: SetEntry[];
  ticked: Record<string, boolean>;
  onToggle: (setId: string) => void;
  exerciseName: (exerciseId: string) => string;
}

/**
 * Les mouvements d'un tour, à cocher au fur et à mesure.
 *
 * Volontairement discrète : dans la mise en page focus, c'est le mouvement en
 * cours qui domine, et cette liste ne sert qu'à savoir ce qui reste. Elle était
 * jusqu'ici faite de cartes pleine largeur, du même poids visuel que le chrono.
 *
 * Partagée par AMRAP et Pour le temps, qui en avaient chacun une copie.
 */
export function MovementChecklist({ sets, ticked, onToggle, exerciseName }: MovementChecklistProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: spacing[1] }}>
      {sets.map((s) => {
        const isTicked = !!ticked[s.id];
        return (
          <Pressable
            key={s.id}
            onPress={() => onToggle(s.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[3],
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              borderRadius: radii.md,
              backgroundColor: pressed ? colors.surfaceElevated : 'transparent',
              opacity: isTicked ? 0.5 : 1,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: isTicked ? colors.success : colors.border,
                backgroundColor: isTicked ? colors.success : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isTicked ? <Text variant="caption" style={{ color: colors.background }}>✓</Text> : null}
            </View>
            <Text
              variant="body"
              color={isTicked ? 'textSubtle' : 'text'}
              style={isTicked ? { textDecorationLine: 'line-through' } : undefined}
            >
              {s.reps != null ? `${s.reps} ` : ''}{exerciseName(s.exerciseId)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
