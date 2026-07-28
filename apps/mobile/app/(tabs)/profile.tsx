import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Gradient, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';

/** A tappable navigation row with a chevron. */
function NavRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: spacing[2] }}>
            <Text variant="heading">{title}</Text>
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          </View>
          <Text variant="subtitle" style={{ color: colors.textSubtle }}>
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** Profile: account header, appearance, devices, settings and sign-out. */
export default function ProfileTab(): React.JSX.Element {
  const { name, preference, toggle, setPreference } = useTheme();
  const { user, mode, signOut } = useAuth();
  const router = useRouter();

  const email = user?.email ?? 'Non connecté';
  const initial = email.charAt(0).toUpperCase();

  return (
    <Screen scroll>
      <Text variant="title">Profil</Text>

      {/* Account header with a gradient avatar */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Gradient fill />
            <Text variant="title" color="onPrimary">
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="subtitle">Mon compte</Text>
              {mode === 'demo' ? <Badge label="Démo" tone="warning" /> : null}
            </View>
            <Text variant="caption" color="textMuted">
              {email}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
          <Button label="Modifier le profil" onPress={() => router.push('/profile/edit')} />
        </View>
      </Card>

      <NavRow
        title="Appareils connectés"
        subtitle="Importe tes activités et données de santé (sommeil, HRV, FC)."
        onPress={() => router.push('/connectors')}
      />
      <NavRow
        title="Réglages"
        subtitle="Profil sportif, unités, notifications, confidentialité, export."
        onPress={() => router.push('/settings')}
      />

      <Card>
        <Text variant="heading">Apparence</Text>
        <Text variant="caption" color="textMuted">
          Thème actif : {name} (préférence : {preference})
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: spacing[2] }}>
          <Button label="Basculer clair/sombre" variant="secondary" onPress={toggle} />
          <Button label="Système" variant="secondary" onPress={() => setPreference('system')} />
        </View>
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Se déconnecter" variant="danger" onPress={signOut} />
      </View>
    </Screen>
  );
}
