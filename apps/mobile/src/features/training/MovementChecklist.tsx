import React from 'react';
import { Pressable, View } from 'react-native';
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
 * Les mouvements d'un tour — un repère de progression, pas une check-list à
 * valider : « Round terminé » reste cliquable à tout moment, coché ou non
 * (retour TestFlight : la case à cocher classique laissait croire le
 * contraire). D'où un simple point plutôt qu'une case, pour ne plus évoquer
 * une tâche obligatoire — le tap-pour-marquer et l'état éphémère restent
 * identiques.
 *
 * Volontairement discrète : dans la mise en page focus, c'est le mouvement en
 * cours qui domine, et cette liste ne sert qu'à savoir ce qui reste. Elle était
 * jusqu'ici faite de cartes pleine largeur, du même poids visuel que le chrono.
 *
 * Partagée par AMRAP et Pour le temps, qui en avaient chacun une copie.
 *
 * Pas de scroll interne (retour TestFlight : la séance entière doit être
 * visible, et le bouton qui valide le tour doit rester atteignable) — un
 * `ScrollView` borné à 160px dans un `ScrollView` parent capte le geste et
 * rendait le bouton d'action inaccessible pour un tour à plusieurs
 * mouvements. La liste fait maintenant partie du flux normal de
 * `RunnerFocus`, qui scrolle déjà dans son ensemble si besoin.
 */
export function MovementChecklist({ sets, ticked, onToggle, exerciseName }: MovementChecklistProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[1] }}>
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
            {/* Un point, pas une case : un repère de progression qu'on peut
                marquer en passant, pas une case qu'il faudrait cocher pour
                avancer. */}
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: radii.full,
                backgroundColor: isTicked ? colors.success : colors.border,
              }}
            />
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
    </View>
  );
}
