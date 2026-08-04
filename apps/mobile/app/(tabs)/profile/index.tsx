import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Gradient, ListRow, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkouts } from '@/lib/data/queries';

/** A grouped section of ListRows on a card (iOS Settings style). */
function Group({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Card style={{ paddingVertical: spacing[1] }}>{children}</Card>;
}

/** Profil (mockup #18): account header, quick stats, grouped navigation, sign-out. */
export default function ProfileTab(): React.JSX.Element {
  const { name, toggle, setPreference } = useTheme();
  const { user, mode, signOut } = useAuth();
  const router = useRouter();
  const { data: workouts = [] } = useWorkouts();

  const email = user?.email ?? '';
  const firstName = email.includes('@') ? email.split('@')[0]!.replace(/[._-]+/g, ' ').trim() : '';
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'Mon compte';
  const initial = user ? email.charAt(0).toUpperCase() : '?';

  return (
    <Screen scroll>
      <Text variant="title">Profil</Text>

      {/* Account header */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Gradient fill />
            <Text variant="title" color="onPrimary">
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="subtitle">{displayName}</Text>
              {mode === 'demo' ? <Badge label="Démo" tone="warning" /> : null}
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {email}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
          <Button label="Modifier le profil" onPress={() => router.push('/profile/edit')} />
        </View>
      </Card>

      {/* Quick stats */}
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <StatCell value={`${workouts.length}`} label="Séances" />
        <StatCell value={mode === 'demo' ? 'Démo' : 'Actif'} label="Compte" />
        <StatCell value={name === 'dark' ? 'Sombre' : 'Clair'} label="Thème" />
      </View>

      {/* Compte & données */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Compte & données
      </Text>
      <Group>
        <ListRow icon="⚖" iconColor="rgba(45,127,249,0.18)" title="Appareils & synchronisation" subtitle="Garmin, Apple Santé, Renpho…" onPress={() => router.push('/connectors')} divider />
        <ListRow icon="🎯" iconColor="rgba(43,227,139,0.18)" title="Objectifs" subtitle="Cibles et progression" onPress={() => router.push('/goals')} divider />
        <ListRow icon="🔔" iconColor="rgba(245,183,66,0.18)" title="Notifications" subtitle="Rappels et alertes" onPress={() => router.push('/notifications')} divider />
        <ListRow icon="🔗" iconColor="rgba(139,92,246,0.18)" title="Données & intégrations" subtitle="Export, connexions tierces" onPress={() => router.push('/integrations')} />
      </Group>

      {/* Préférences */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Préférences
      </Text>
      <Group>
        <ListRow icon="⚙️" iconColor="rgba(116,128,146,0.22)" title="Réglages" subtitle="Unités, thème, confidentialité, sécurité" onPress={() => router.push('/settings')} divider />
        <ListRow icon="🌗" iconColor="rgba(116,128,146,0.22)" title="Thème" value={name === 'dark' ? 'Sombre' : 'Clair'} onPress={toggle} divider />
        <ListRow icon="🖥" iconColor="rgba(116,128,146,0.22)" title="Suivre le système" onPress={() => setPreference('system')} />
      </Group>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label="Se déconnecter" variant="danger" onPress={signOut} />
      </View>
    </Screen>
  );
}

function StatCell({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3], alignItems: 'center' }}>
      <Text variant="subtitle">{value}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}
