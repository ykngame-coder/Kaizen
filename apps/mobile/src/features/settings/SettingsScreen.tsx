import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Icon, Input, ListRow, Screen, SegmentedControl, Text, Toggle, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences, type LanguagePreference, type TimeFormat, type UnitSystem } from '@/lib/preferences';
import { createDataRepository, exportUserData } from '@/lib/data/repository';
import { deleteAccount } from '@/features/auth/accountClient';
import { isBiometricSupported } from '@/lib/biometric-lock';
import { errorMessage } from '@/lib/errors';

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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { name, preference, setPreference: setThemePref, colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const { user, mode, signOut } = useAuth();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
    { value: 'metric', label: t('settings.screen.preferences.units.options.metric') },
    { value: 'imperial', label: t('settings.screen.preferences.units.options.imperial') },
  ];
  const THEME_OPTIONS = [
    { value: 'dark' as const, label: t('settings.screen.preferences.theme.options.dark') },
    { value: 'light' as const, label: t('settings.screen.preferences.theme.options.light') },
    { value: 'system' as const, label: t('settings.screen.preferences.theme.options.system') },
  ];
  const TIME_OPTIONS: { value: TimeFormat; label: string }[] = [
    { value: '24h', label: t('settings.screen.preferences.timeFormat.options.24h') },
    { value: '12h', label: t('settings.screen.preferences.timeFormat.options.12h') },
  ];
  const LANGUAGE_OPTIONS: { value: LanguagePreference; label: string }[] = [
    { value: 'auto', label: t('settings.screen.preferences.languageOptions.auto') },
    { value: 'fr', label: t('settings.screen.preferences.languageOptions.fr') },
    { value: 'en', label: t('settings.screen.preferences.languageOptions.en') },
    { value: 'es', label: t('settings.screen.preferences.languageOptions.es') },
    { value: 'pt', label: t('settings.screen.preferences.languageOptions.pt') },
    { value: 'de', label: t('settings.screen.preferences.languageOptions.de') },
  ];
  // The actual active language (i18n.language is always a resolved SupportedLanguage,
  // never 'auto') — this is what must be reflected in the "Langue" row's value, not a
  // hardcoded label, so it stays correct whether the user picked a specific language or 'auto'.
  const currentLanguageLabel =
    LANGUAGE_OPTIONS.find((o) => o.value === i18n.language)?.label ?? LANGUAGE_OPTIONS[1]!.label;
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
        setDeleteError(errorMessage(e, t('settings.screen.dangerZone.deleteError')));
      } finally {
        setDeleteBusy(false);
      }
    })();
  };

  const confirmDeleteAccount = (): void => {
    setDeleteError(null);
    const title = t('settings.screen.dangerZone.confirm.title');
    const message = t('settings.screen.dangerZone.confirm.message');

    // Alert.alert's multi-button form is a no-op on web (react-native-web
    // doesn't implement it) — the confirmation would silently never show and
    // the button would appear to do nothing. window.confirm is the web
    // equivalent; native keeps the proper Alert with a destructive style.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) runDeleteAccount();
      return;
    }
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.screen.dangerZone.confirm.confirmButton'), style: 'destructive', onPress: runDeleteAccount },
    ]);
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('settings.screen.title')}</Text>
      <Text variant="caption" color="textSubtle">{t('settings.screen.subtitle')}</Text>

      {/* Compte */}
      <GroupTitle>{t('settings.screen.groups.account')}</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="person" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title={t('settings.screen.account.profile.title')} subtitle={t('settings.screen.account.profile.subtitle')} onPress={() => router.push('/profile/edit')} divider />
        <ListRow icon={<Icon name="star" color={colors.warning} />} iconColor="rgba(245,183,66,0.18)" title={t('settings.screen.account.subscription.title')} accessory={<Badge label={t('settings.screen.account.subscription.badge')} tone="neutral" />} />
      </Group>

      {/* Préférences */}
      <GroupTitle>{t('settings.screen.groups.preferences')}</GroupTitle>
      <Card>
        <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>{t('settings.screen.preferences.theme.label')}</Text>
        <SegmentedControl options={THEME_OPTIONS} value={preference} onChange={(v) => setThemePref(v)} />
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>{name === 'dark' ? t('settings.screen.preferences.theme.activeDark') : t('settings.screen.preferences.theme.activeLight')}</Text>
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>{t('settings.screen.preferences.units.label')}</Text>
        <SegmentedControl options={UNIT_OPTIONS} value={preferences.units} onChange={(v) => setPreference('units', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>{t('settings.screen.preferences.timeFormat.label')}</Text>
        <SegmentedControl options={TIME_OPTIONS} value={preferences.timeFormat} onChange={(v) => setPreference('timeFormat', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>{t('settings.screen.preferences.languageLabel')}</Text>
        <SegmentedControl vertical options={LANGUAGE_OPTIONS} value={preferences.language} onChange={(v) => setPreference('language', v)} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>{t('settings.screen.preferences.dailyStepsGoal.label')}</Text>
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
        <ListRow icon={<Icon name="language" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.preferences.languageLabel')} value={currentLanguageLabel} divider />
        <ToggleRow icon={<Icon name="vibrate" color={colors.info} />} tint="rgba(59,203,255,0.18)" label={t('settings.screen.preferences.haptics')} value={preferences.haptics} onValueChange={(v) => setPreference('haptics', v)} />
      </Group>

      {/* Notifications */}
      <GroupTitle>{t('settings.screen.groups.notifications')}</GroupTitle>
      <Group>
        <ToggleRow icon={<Icon name="clipboardText" color={colors.accentData} />} tint="rgba(43,227,139,0.18)" label={t('settings.screen.notifications.dailyBriefing')} value={preferences.dailyBriefing} onValueChange={(v) => setPreference('dailyBriefing', v)} divider />
        <ToggleRow icon={<Icon name="notifications" color={colors.warning} />} tint="rgba(245,183,66,0.18)" label={t('settings.screen.notifications.reminders')} value={preferences.reminders} onValueChange={(v) => setPreference('reminders', v)} divider />
        <ListRow icon={<Icon name="settings" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.notifications.configureByCategory')} onPress={() => router.push('/profile/notifications')} />
      </Group>

      {/* Confidentialité */}
      <GroupTitle>{t('settings.screen.groups.privacy')}</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="download" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title={exportState === 'working' ? t('settings.screen.privacy.export.titleWorking') : t('settings.screen.privacy.export.titleIdle')} subtitle={t('settings.screen.privacy.export.subtitle')} onPress={onExport} divider />
        <ListRow icon={<Icon name="search" color={colors.info} />} iconColor="rgba(59,203,255,0.18)" title={t('settings.screen.privacy.dataQuality')} onPress={() => router.push('/profile/data-quality')} divider />
        <ToggleRow icon={<Icon name="brain" color={colors.accentMobility} />} tint="rgba(139,92,246,0.18)" label={t('settings.screen.privacy.aiConsent')} value={aiConsent} onValueChange={setAiConsent} />
      </Group>
      {exportState === 'done' ? <Text variant="caption" color="textSubtle">{Platform.OS === 'web' ? t('settings.screen.privacy.exportReadyDownloaded') : t('settings.screen.privacy.exportReadyShared')}</Text> : null}
      {exportState === 'error' ? <Text variant="caption" color="error">{t('settings.screen.privacy.exportError')}</Text> : null}

      {/* Sécurité */}
      <GroupTitle>{t('settings.screen.groups.security')}</GroupTitle>
      <Group>
        {Platform.OS !== 'web' ? (
          <ToggleRow
            icon={<Icon name="shieldLock" color={colors.accentData} />}
            tint="rgba(43,227,139,0.18)"
            label={t('settings.screen.security.biometricLock')}
            subtitle={biometricSupported ? undefined : t('settings.screen.security.biometricUnavailable')}
            value={preferences.biometricLock}
            onValueChange={(v) => setPreference('biometricLock', v)}
            disabled={!biometricSupported}
            divider
          />
        ) : null}
        <ListRow icon={<Icon name="logout" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.security.signOut')} onPress={signOut} />
      </Group>

      {/* Zone de danger — deliberately separated from "Se déconnecter" above:
          the two used to sit in the same group with identical red styling,
          which risked exactly the accidental-tap-then-confirm-without-reading
          scenario that caused a tester to lose their data. */}
      <GroupTitle>{t('settings.screen.groups.dangerZone')}</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="trash" color={colors.error} />} iconColor="rgba(255,77,103,0.18)" title={deleteBusy ? t('settings.screen.dangerZone.deleteAccount.titleBusy') : t('settings.screen.dangerZone.deleteAccount.titleIdle')} subtitle={t('settings.screen.dangerZone.deleteAccount.subtitle')} destructive onPress={confirmDeleteAccount} />
      </Group>
      {deleteError ? <Text variant="caption" color="error">{deleteError}</Text> : null}

      {/* À propos */}
      <GroupTitle>{t('settings.screen.groups.help')}</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="lifebuoy" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title={t('settings.screen.help.title')} subtitle={t('settings.screen.help.subtitle')} onPress={() => router.push('/profile/support')} />
      </Group>

      <GroupTitle>{t('settings.screen.groups.about')}</GroupTitle>
      <Group>
        <ListRow icon={<Icon name="infoOutline" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.about.version')} value="1.0.0" divider />
        <ListRow icon={<Icon name="fileDocument" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.about.terms')} chevron onPress={() => router.push('/terms')} divider />
        <ListRow icon={<Icon name="lock" color={colors.textSubtle} />} iconColor="rgba(116,128,146,0.22)" title={t('settings.screen.about.privacyPolicy')} chevron onPress={() => router.push('/privacy')} />
      </Group>

      {mode === 'demo' ? <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[3] }}>{t('settings.screen.demoModeNotice')}</Text> : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
