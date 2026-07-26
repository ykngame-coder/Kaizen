import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Neuro Recovery Suite hub (cahier des charges §3.7). Gathers relaxation tools:
 * guided breathing, cardiac coherence and (visual) bilateral stimulation.
 *
 * Compliance requirement: the EMDR vs bilateral-stimulation distinction is shown
 * up front, before any use, and the feature is never framed as therapy.
 */
function ToolCard({
  title,
  description,
  actionLabel,
  onPress,
  soon,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress?: () => void;
  soon?: boolean;
}): React.JSX.Element {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{title}</Text>
        {soon && <Badge label="Bientôt" tone="info" />}
      </View>
      <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
        {description}
      </Text>
      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button
          label={actionLabel}
          variant={soon ? 'secondary' : 'primary'}
          disabled={soon}
          onPress={onPress}
        />
      </View>
    </Card>
  );
}

export function NeuroRecoveryScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <Screen scroll>
      <Text variant="title">Récupération neuro-sensorielle</Text>
      <Text variant="caption" color="textMuted">
        Des outils simples pour faire redescendre la pression et préparer le sommeil.
      </Text>

      <Card>
        <Text variant="label" color="warning">
          ⚠️ À LIRE AVANT UTILISATION
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          Ces outils sont des aides à la relaxation, sans visée thérapeutique. En particulier, la
          stimulation bilatérale proposée ici n’est <Text variant="caption">pas</Text> de la
          thérapie EMDR : l’EMDR est une psychothérapie réalisée par un professionnel de santé
          formé. En cas de difficulté psychologique, consulte un professionnel.
        </Text>
      </Card>

      <ToolCard
        title="Respiration guidée"
        description="Carré, 4-7-8 ou cohérence cardiaque — suis le cercle qui respire avec toi."
        actionLabel="Ouvrir"
        onPress={() => router.push('/breathing')}
      />

      <ToolCard
        title="Stimulation bilatérale"
        description="Un point qui se déplace de gauche à droite ; suis-le des yeux pour te détendre. Outil de relaxation, pas une thérapie."
        actionLabel="Ouvrir"
        onPress={() => router.push('/bilateral')}
      />

      <ToolCard
        title="Sons apaisants"
        description="Pluie, vagues, vent, bruits colorés — ou tes propres sons — avec minuterie et fondu de sortie."
        actionLabel="Ouvrir"
        onPress={() => router.push('/sound')}
      />

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
