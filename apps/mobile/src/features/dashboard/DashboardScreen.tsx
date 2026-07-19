import React from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, KPICard, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Étape 1 dashboard placeholder. Layout and components are real; values are
 * static until the Decision/Performance/Recovery engines are wired (Étape 3-4).
 * Answers the product's core question: "Comment vais-je aujourd'hui ?" (P3).
 */
export function DashboardScreen(): React.JSX.Element {
  const { name, toggle } = useTheme();

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text variant="title">Bonjour 👋</Text>
          <Text variant="caption" color="textMuted">
            Comment vais-je aujourd'hui ?
          </Text>
        </View>
        <Button label={name === 'dark' ? '☀︎' : '☾'} variant="secondary" onPress={toggle} />
      </View>

      <KPICard
        label="Score Supotsu"
        value="—"
        unit="/100"
        trend="flat"
        caption="En attente des premières données (Étape 3-4)."
      />

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <KPICard label="Récupération" value="—" unit="/100" />
        </View>
        <View style={{ flex: 1 }}>
          <KPICard label="Disponibilité" value="—" unit="/100" />
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="heading">Recommandation du jour</Text>
          <Badge label="À confirmer" tone="info" />
        </View>
        <Text variant="caption" color="textMuted">
          Observation → Analyse → Action
        </Text>
        <Text variant="body" color="textMuted">
          Le coach IA expliquera ici chaque conseil, avec son niveau de confiance. Rien n'est encore
          calculé : la logique arrive avec les moteurs (Étape 4).
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Prochaine séance</Text>
        <Text variant="body" color="textMuted">
          Aucune séance planifiée. La création et le suivi d'entraînement arrivent en Étape 3.
        </Text>
        <Button label="Créer une séance" variant="primary" disabled />
      </Card>
    </Screen>
  );
}
