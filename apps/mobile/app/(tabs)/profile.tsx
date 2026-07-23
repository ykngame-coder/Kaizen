import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';

/** Profile: account, appearance, devices and sign-out. */
export default function ProfileTab(): React.JSX.Element {
  const { name, preference, toggle, setPreference } = useTheme();
  const { user, mode, signOut } = useAuth();
  const router = useRouter();

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
        <Text variant="heading">Appareils connectés</Text>
        <Text variant="body" color="textMuted">
          Importe tes activités et données de santé (sommeil, HRV, FC).
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Mes appareils" onPress={() => router.push('/connectors')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Réglages</Text>
        <Text variant="body" color="textMuted">
          Profil sportif, unités, notifications, confidentialité et export de tes données.
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
          <Button label="Ouvrir les réglages" onPress={() => router.push('/settings')} />
        </View>
      </Card>
    </Screen>
  );
}
