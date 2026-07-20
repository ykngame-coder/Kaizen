import React from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Screen, Text, useTheme } from '@supotsu/ui';
import { useAuth } from '@/features/auth/AuthProvider';

/** Profile: account, appearance and sign-out. */
export default function ProfileTab(): React.JSX.Element {
  const { name, preference, toggle, setPreference } = useTheme();
  const { user, mode, signOut } = useAuth();

  return (
    <Screen scroll>
      <Text variant="title">Profil</Text>
      <Text variant="body" color="textMuted">
        Informations, objectifs, appareils connectés, confidentialité et abonnement.
      </Text>

      <Card>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="heading">Compte</Text>
          {mode === 'demo' ? <Badge label="Démo" tone="warning" /> : null}
        </View>
        <Text variant="body" color="textMuted">
          {user?.email ?? 'Non connecté'}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Se déconnecter" variant="danger" onPress={signOut} />
        </View>
      </Card>

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
