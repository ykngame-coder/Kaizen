import React from 'react';
import { Pressable, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';

export interface RunnerFocusProps {
  /** Petite pastille au-dessus du titre — format du bloc, groupe musculaire. */
  tag?: string;
  /** Ce qu'on fait maintenant. Le plus gros élément de l'écran. */
  title: string;
  /** Progression : une pastille par série/round, `current` étant 1-indexé. */
  total?: number;
  current?: number;
  /** Ligne de situation, au-dessus de la valeur : « Série 1 sur 8 ». */
  context?: string;
  /** La valeur dominante : « 20s », « 5 reps », un décompte. */
  value: string;
  /** Précision sous la valeur : « Repos après : 10s ». */
  valueHint?: string;
  /** Teinte de la valeur et de la pastille active — repos en vert, effort en émeraude. */
  accent?: string;
  /** L'unique action. */
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  /** L'échappatoire, toujours disponible, jamais concurrente. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Contenu additionnel sous les actions (saisie, pause…). */
  children?: React.ReactNode;
}

/**
 * Mise en page d'un écran de runner : une seule décision à l'écran.
 *
 * Reprend la grammaire de Supotsu Élite, que l'app d'origine appliquait à son
 * runner — « lisible, facile d'utilisation, intuitif ». Le runner de Kaizen
 * affichait jusqu'ici une liste de cartes de séries, des champs en ligne, une
 * rangée de boutons d'effort et une carte de repos, tout au même poids visuel :
 * tout était présent, rien ne dominait, et il fallait trier en plein effort.
 *
 * Trois règles :
 * — le plus gros élément à l'écran est celui sur lequel on agit ;
 * — une seule action pleine, l'échappatoire reste un lien ;
 * — la position est toujours lisible (pastilles + ligne de situation), pour
 *   qu'on puisse se passer de la liste.
 *
 * Le titre garde Oswald mais PAS les majuscules de `variant="display"` : un nom
 * comme « Standing Cable Wood Chop » en capitales se lit mal d'un coup d'œil,
 * ce qui annulerait tout le bénéfice.
 */
export function RunnerFocus({
  tag,
  title,
  total,
  current,
  context,
  value,
  valueHint,
  accent,
  actionLabel,
  onAction,
  actionDisabled = false,
  secondaryLabel,
  onSecondary,
  children,
}: RunnerFocusProps): React.JSX.Element {
  const { colors } = useTheme();
  const tint = accent ?? colors.primary;

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing[5] }}>
      <View style={{ alignItems: 'center', gap: spacing[3] }}>
        {tag ? (
          <View
            style={{
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[1],
              borderRadius: radii.full,
              // Teinte de l'accent plutôt qu'une surface neutre : la pastille
              // appartient à l'exercice en cours, elle n'est pas du décor.
              backgroundColor: `${tint}22`,
            }}
          >
            <Text variant="label" style={{ color: tint }}>{tag}</Text>
          </View>
        ) : null}

        <Text
          variant="display"
          style={{
            // lineHeight explicite : sans lui iOS rogne les hampes d'Oswald à
            // cette taille (déjà constaté sur le score discipline).
            fontSize: 40,
            lineHeight: 46,
            textTransform: 'none',
            textAlign: 'center',
            color: colors.text,
          }}
        >
          {title}
        </Text>

        {total && total > 1 ? (
          <View style={{ flexDirection: 'row', gap: spacing[1], flexWrap: 'wrap', justifyContent: 'center' }}>
            {Array.from({ length: total }, (_, i) => {
              const n = i + 1;
              const done = current != null && n < current;
              const now = current != null && n === current;
              return (
                <View
                  key={n}
                  style={{
                    width: now ? 26 : 16,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: now ? tint : done ? colors.success : colors.surfaceElevated,
                  }}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      <View
        style={{
          alignItems: 'center',
          gap: spacing[2],
          paddingVertical: spacing[5],
          paddingHorizontal: spacing[4],
          borderRadius: radii.xl,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        {context ? <Text variant="label" color="textSubtle">{context}</Text> : null}
        {/* Chiffres tabulaires : sans eux un décompte qui change chaque
            seconde fait bouger toute la ligne. La police `data` est décrite
            comme tabulaire mais rien ne l'activait. */}
        <Text
          variant="data"
          style={{ fontSize: 56, lineHeight: 64, color: tint, fontVariant: ['tabular-nums'] }}
        >
          {value}
        </Text>
        {valueHint ? <Text variant="caption" color="textSubtle">{valueHint}</Text> : null}
      </View>

      {children}

      <View style={{ gap: spacing[3] }}>
        <Pressable
          onPress={onAction}
          disabled={actionDisabled}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: radii.xl,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tint,
            opacity: actionDisabled ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          <Text variant="subtitle" style={{ fontWeight: '700', color: '#04140b' }}>{actionLabel}</Text>
        </Pressable>

        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text variant="body" color="textSubtle" style={{ textAlign: 'center' }}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
