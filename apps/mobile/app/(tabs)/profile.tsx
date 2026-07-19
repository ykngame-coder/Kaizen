import React from 'react';
import { View } from 'react-native';
import { Button, Card, Screen, Text, useTheme } from '@supotsu/ui';

/** Profile stub with a working theme toggle to prove dark/light theming. */
export default function ProfileTab(): React.JSX.Element {
  const { name, preference, toggle, setPreference } = useTheme();

  return (
    <Screen scroll>
      <Text variant="title">Profil</Text>
      <Text variant="body" color="textMuted">
        Informations, objectifs, appareils connectés, confidentialité et abonnement.
      </Text>

      <Card>
        <Text variant="heading">Apparence</Text>
        <Text variant="caption" color="textMuted">
          Thème actif : {name} (préférence : {preference})
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button label="Basculer clair/sombre" onPress={toggle} />
          <Button label="Système" variant="secondary" onPress={() => setPreference('system')} />
        </View>
      </Card>

      <Card>
        <Text variant="label" color="textMuted">
          À VENIR
        </Text>
        <Text variant="body">
          Authentification (email, Apple, Google, biométrie) et onboarding — Étape 2. Export /
          suppression RGPD — Étape 2+.
        </Text>
      </Card>
    </Screen>
  );
}
