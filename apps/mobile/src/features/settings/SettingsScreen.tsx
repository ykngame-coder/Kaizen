import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Icon, Input, ListRow, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences, type LanguagePreference, type TimeFormat, type UnitSystem } from '@/lib/preferences';
import { createDataRepository, exportUserData } from '@/lib/data/repository';
import { deleteAccount } from '@/features/auth/accountClient';
import { isBiometricSupported } from '@/lib/biometric-lock';
import { errorMessage } from '@/lib/errors';

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Métrique (kg, km)' },
  { value: 'imperial', label: 'Impérial (lb, mi)' },
];
const THEME_OPTIONS = [
  { value: 'dark' as const, label: 'Sombre' },
  { value: 'light' as const, label: 'Clair' },
  { value: 'system' as const, label: 'Auto' },
];
const TIME_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '24h', label: '24 h' },
  { value: '12h', label: '12 h' },
];
const LANGUAGE_OPTIONS: { value: LanguagePreference; label: string }[] = [
  { value: 'auto', label: 'Automatique (téléphone)' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
];

function GroupTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text variant="label" color="textSubtle" style={{ marginTop: spacing[4], marginBottom: spacing[1], letterSpacing: 1 }}>{children}</Text>;
}
function Group({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Card style={{ paddingVertical: spacing[1] }}>{children}</Card>;
}
function ToggleRow({ icon, tint, label, subtitle, value, onValueChange, divider, disabled }: { icon: React.ReactNode; tint: string; label: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; divider?: boolean; disabled?: boolean }): React.JSX.Element {
  return <ListRow icon={icon} iconColor={tint} title={label} subtitle={subtitle} accessory={<Toggle value={value} onValueChange={onValueChange} disabled={disabled} />} divider={divider} />;
}

/** Réglages (mockup #16) — grouped preferences, notifications, privacy, security, about. */
export function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { name, preference, setPreference: setThemePref, colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const { user, mode, signOut } = useAuth();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  // Not wired to a real behaviour yet — kept as a session-only preference
  // until AI-generated analyses ship.
  const [aiConsent, setAiConsent] = useState(true);
  const [biometricSupported, setBiometricSupported] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void isBiometricSupported().then(setBiometricSupported);
  }, []);

  const onExport = async (): Promise<void> => {
    if (!user) return;
    setExportState('working');
    try {
      const data = await exportUserData(createDataRepository(), user.id);
      const json = JSON.stringify(data, null, 2);
      const filename = `kaizen-export-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const FS = await import('expo-file-system/legacy');
        const uri = `${FS.cacheDirectory}${filename}`;
        await FS.writeAsStringAsync(uri, json, { encoding: FS.EncodingType.UTF8 });
        await Share.share({ url: uri, title: filename });
      }
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runDeleteAccount = (): void => {
    void (async (): Promise<void> => {
      setDeleteBusy(true);
      try {
        if (mode === 'demo') {
          await signOut();
        } else {
          await deleteAccount();
          // The account is already gone server-side at this point, so
          // a failure here (e.g. the server-side signOut call erroring
          // against an already-deleted user) isn't a real problem —
          // don't surface it as a deletion failure.
          try {
            await signOut();
          } catch {
            /* account is already deleted; local session will clear regardless */
          }
        }
      } catch (e) {
        setDeleteError(errorMessage(e, 'Suppression impossible.'));
      } finally {
        setDeleteBusy(false);
      }
    })();
  };

  const confirmDeleteAccount = (): void => {
    setDeleteError(null);
    const title = 'Supprimer définitivement ton compte ?';
    const message = 'Toutes tes données — séances, santé, sommeil, nutrition, objectifs — seront supprimées immédiatement et de façon irréversible.';

    // Alert.alert's multi-button form is a no-op on web (react-native-web
    // doesn't implement it) — the confirmation would silently never show and
    // the button would appear to do nothing. window.confirm is the web
    // equivalent; native keeps the proper Alert with a destructive style.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) runDeleteAccount();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: runDeleteAccount },
    ]);
  };

  return (
    <Screen scroll>
      <Text variant="title">Réglages</Text>
      <Text variant="caption" color="textSubtle">Préférences • Compte • Sécurité</Text>

      {/* Compte */}
      <GroupTitle>COMPTE</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="person" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title="Profil sportif" subtitle="Poids, taille, niveau, disponibilités" onPress={() => router.push('/profile/edit')} divider />
        <ListRow icon={<Icon name="star" color={colors.warning} />} iconColor="rgba(245,183,66,0.18)" title="Abonnement" accessory={<Badge label="Gratuit" tone="neutral" />} />
      </Group>

      {/* Préférences */}
      <GroupTitle>PRÉFÉRENCES</GroupTitle>
      <Card>
        <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>Thème</Text>
        <SegmentedControl options={THEME_OPTIONS} value={preference} onChange={(v) => setThemePref(v)} />
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>Actif : {name === 'dark' ? 'sombre' : 'clair'}</Text>
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Unités</Text>
        <SegmentedControl options={UNIT_OPTIONS} value={preferences.units} onChange={(v) => setPreference('units', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Format horaire</Text>
        <SegmentedControl options={TIME_OPTIONS} value={preferences.timeFormat} onChange={(v) => setPreference('timeFormat', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Langue</Text>
        <SegmentedControl vertical options={LANGUAGE_OPTIONS} value={preferences.language} onChange={(v) => setPreference('language', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Objectif de pas quotidien</Text>
        <Input
          value={String(preferences.dailyStepsGoal)}
          onChangeText={(v) => {
            const n = Number(v.replace(/[^0-9]/g, ''));
            if (Number.isFinite(n)) setPreference('dailyStepsGoal', n);
          }}
          keyboardType="number-pad"
          placeholder="10000"
        />
      </Card>
      <Group>
        <ListRow icon={<Icon name="language" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Langue" value="Français" divider />
        <ToggleRow icon={<Icon name="vibrate" color={colors.info} />} tint="rgba(59,203,255,0.18)" label="Retour haptique" value={preferences.haptics} onValueChange={(v) => setPreference('haptics', v)} />
      </Group>

      {/* Notifications */}
      <GroupTitle>NOTIFICATIONS</GroupTitle>
      <Group>
        <ToggleRow icon={<Icon name="clipboardText" color={colors.accentData} />} tint="rgba(43,227,139,0.18)" label="Bilan du jour" value={preferences.dailyBriefing} onValueChange={(v) => setPreference('dailyBriefing', v)} divider />
        <ToggleRow icon={<Icon name="notifications" color={colors.warning} />} tint="rgba(245,183,66,0.18)" label="Rappels (habitudes, check-in)" value={preferences.reminders} onValueChange={(v) => setPreference('reminders', v)} divider />
        <ListRow icon={<Icon name="settings" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Configurer par catégorie" onPress={() => router.push('/profile/notifications')} />
      </Group>

      {/* Confidentialité */}
      <GroupTitle>CONFIDENTIALITÉ & DONNÉES</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="download" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title={exportState === 'working' ? 'Export en cours…' : 'Exporter mes données (JSON)'} subtitle="Toutes tes données, format RGPD" onPress={onExport} divider />
        <ListRow icon={<Icon name="search" color={colors.info} />} iconColor="rgba(59,203,255,0.18)" title="Qualité & provenance" onPress={() => router.push('/profile/data-quality')} divider />
        <ToggleRow icon={<Icon name="brain" color={colors.accentMobility} />} tint="rgba(139,92,246,0.18)" label="Consentement analyses IA" value={aiConsent} onValueChange={setAiConsent} />
      </Group>
      {exportState === 'done' ? <Text variant="caption" color="textSubtle">Export prêt {Platform.OS === 'web' ? '(téléchargé)' : '(partagé)'}.</Text> : null}
      {exportState === 'error' ? <Text variant="caption" color="error">L'export a échoué. Réessaie.</Text> : null}

      {/* Sécurité */}
      <GroupTitle>SÉCURITÉ</GroupTitle>
      <Group>
        {Platform.OS !== 'web' ? (
          <ToggleRow
            icon={<Icon name="shieldLock" color={colors.accentData} />}
            tint="rgba(43,227,139,0.18)"
            label="Verrouillage biométrique"
            subtitle={biometricSupported ? undefined : 'Aucun Face ID / Touch ID configuré sur cet appareil'}
            value={preferences.biometricLock}
            onValueChange={(v) => setPreference('biometricLock', v)}
            disabled={!biometricSupported}
            divider
          />
        ) : null}
        <ListRow icon={<Icon name="logout" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Se déconnecter" onPress={signOut} />
      </Group>

      {/* Zone de danger — deliberately separated from "Se déconnecter" above:
          the two used to sit in the same group with identical red styling,
          which risked exactly the accidental-tap-then-confirm-without-reading
          scenario that caused a tester to lose their data. */}
      <GroupTitle>ZONE DE DANGER</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="trash" color={colors.error} />} iconColor="rgba(255,77,103,0.18)" title={deleteBusy ? 'Suppression…' : 'Supprimer mon compte'} subtitle="Irréversible — toutes tes données sont effacées immédiatement." destructive onPress={confirmDeleteAccount} />
      </Group>
      {deleteError ? <Text variant="caption" color="error">{deleteError}</Text> : null}

      {/* À propos */}
      <GroupTitle>AIDE</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="lifebuoy" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title="Aide & Support" subtitle="FAQ, guides, diagnostic, contact" onPress={() => router.push('/profile/support')} />
      </Group>

      <GroupTitle>À PROPOS</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="infoOutline" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Version" value="1.0.0" divider />
        <ListRow icon={<Icon name="fileDocument" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Conditions d'utilisation" chevron onPress={() => router.push('/terms')} divider />
        <ListRow icon={<Icon name="lock" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title="Politique de confidentialité" chevron onPress={() => router.push('/privacy')} />
      </Group>

      {mode === 'demo' ? <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[3] }}>Mode démo : tes données restent sur cet appareil.</Text> : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
