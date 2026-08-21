import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Button, Card, Gradient, Icon, ListRow, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkouts } from '@/lib/data/queries';
import {
  clearAvatarUri,
  getCloudAvatarUrl,
  loadAvatarUri,
  removeCloudAvatar,
  setAvatarUri,
  uploadAvatarToCloud,
} from '@/lib/profileAvatar';

/** A grouped section of ListRows on a card (iOS Settings style). */
function Group({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Card style={{ paddingVertical: spacing[1] }}>{children}</Card>;
}

/** Profil (mockup #18): account header, quick stats, grouped navigation, sign-out. */
export default function ProfileTab(): React.JSX.Element {
  const { name, colors } = useTheme();
  const { user, mode, signOut } = useAuth();
  const router = useRouter();
  const { data: workouts = [] } = useWorkouts();
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const cloudBacked = mode !== 'demo' && !!user;

  useEffect(() => {
    if (cloudBacked) void getCloudAvatarUrl(user!.id).then(setAvatarUriState);
    else void loadAvatarUri().then(setAvatarUriState);
  }, [cloudBacked, user?.id]);

  const email = user?.email ?? '';
  const firstName = email.includes('@') ? email.split('@')[0]!.replace(/[._-]+/g, ' ').trim() : '';
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'Mon compte';
  const initial = user ? email.charAt(0).toUpperCase() : '?';

  const pickAvatar = async (from: 'camera' | 'library'): Promise<void> => {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setAvatarError('Autorisation refusée. Active l’accès à l’appareil photo / aux photos dans les réglages.');
        return;
      }
      const opts = { quality: 0.6, base64: Platform.OS === 'web', allowsEditing: true, aspect: [1, 1] as [number, number] } as const;
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const srcUri = Platform.OS === 'web' && asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setAvatarUriState(cloudBacked ? await uploadAvatarToCloud(user!.id, srcUri) : await setAvatarUri(srcUri));
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Impossible de changer la photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async (): Promise<void> => {
    setAvatarError(null);
    if (cloudBacked) await removeCloudAvatar(user!.id);
    else await clearAvatarUri();
    setAvatarUriState(null);
  };

  return (
    <Screen scroll>
      <Text variant="title" style={{ textAlign: 'center' }}>Profil</Text>

      {/* Account header */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
          <Pressable onPress={() => pickAvatar('library')} disabled={avatarBusy}>
            <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: 64, height: 64 }} resizeMode="cover" />
              ) : (
                <>
                  <Gradient fill />
                  <Text variant="title" color="onGradient">
                    {initial}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="subtitle">{displayName}</Text>
              {mode === 'demo' ? <Badge label="Démo" tone="warning" /> : null}
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {email}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
              <Pressable onPress={() => pickAvatar('camera')} disabled={avatarBusy}>
                <Text variant="caption" color="primary">{avatarBusy ? '…' : '📷 Prendre une photo'}</Text>
              </Pressable>
              {avatarUri ? (
                <Pressable onPress={removeAvatar} disabled={avatarBusy}>
                  <Text variant="caption" color="error">Supprimer</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        {avatarError ? (
          <Text variant="caption" color="error" style={{ marginTop: spacing[2] }}>
            {avatarError}
          </Text>
        ) : null}
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
        <ListRow icon={<Icon name="devices" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title="Appareils & synchronisation" subtitle="Garmin, Apple Santé, Renpho…" onPress={() => router.push('/profile/connectors')} divider />
        <ListRow icon={<Icon name="target" color={colors.accentData} />} iconColor="rgba(43,227,139,0.18)" title="Objectifs" subtitle="Cibles et progression" onPress={() => router.push('/profile/goals')} divider />
        <ListRow icon={<Icon name="notifications" color={colors.warning} />} iconColor="rgba(245,183,66,0.18)" title="Notifications" subtitle="Rappels et alertes" onPress={() => router.push('/profile/notifications')} divider />
        <ListRow icon={<Icon name="link" color={colors.accentMobility} />} iconColor="rgba(139,92,246,0.18)" title="Données & intégrations" subtitle="Export, connexions tierces" onPress={() => router.push('/profile/integrations')} divider />
        <ListRow icon={<Icon name="clipboardCheck" color={colors.accentMobility} />} iconColor="rgba(139,92,246,0.18)" title="Qualité des données" subtitle="Complétude et fiabilité de tes sources" onPress={() => router.push('/profile/data-quality')} divider />
        <ListRow icon={<Icon name="download" color={colors.accentMobility} />} iconColor="rgba(139,92,246,0.18)" title="Importer un fichier" subtitle="Export Garmin / Apple Santé (JSON)" onPress={() => router.push('/profile/import')} />
      </Group>

      {/* Bilan & communauté */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Bilan & communauté
      </Text>
      <Group>
        <ListRow icon={<Icon name="chartBar" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title="Bilan & badges" subtitle="Tendances, statistiques, récompenses" onPress={() => router.push('/profile/progression')} divider />
        <ListRow icon={<Icon name="calendarCheck" color={colors.accentData} />} iconColor="rgba(43,227,139,0.18)" title="Habitudes & discipline" subtitle="Check-list, séries, régularité" onPress={() => router.push('/profile/habits')} divider />
        <ListRow icon={<Icon name="peopleGroup" color={colors.warning} />} iconColor="rgba(245,183,66,0.18)" title="Communauté" subtitle="Défis, entraide" onPress={() => router.push('/profile/community')} divider />
        <ListRow icon={<Icon name="cart" color={colors.warning} />} iconColor="rgba(245,183,66,0.18)" title="Marketplace" subtitle="Programmes structurés" onPress={() => router.push('/marketplace')} />
      </Group>

      {/* Préférences */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Préférences
      </Text>
      <Group>
        <ListRow icon={<Icon name="settings" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Réglages" subtitle="Unités, thème, confidentialité, sécurité" onPress={() => router.push('/profile/settings')} divider />
        <ListRow icon={<Icon name="chat" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Support" subtitle="Aide et contact" onPress={() => router.push('/profile/support')} />
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
