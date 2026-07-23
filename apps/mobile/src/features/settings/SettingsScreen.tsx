import React, { useState } from 'react';
import { Platform, Share, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences, type UnitSystem } from '@/lib/preferences';
import { createDataRepository, exportUserData } from '@/lib/data/repository';

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Métrique (kg, km)' },
  { value: 'imperial', label: 'Impérial (lb, mi)' },
];

function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
        thumbColor={colors.onPrimary}
      />
    </View>
  );
}

/** Settings & privacy (Master Prompt P15 confidentialité, P17 réglages). */
export function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { name, preference, toggle, setPreference: setThemePref } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const { user, mode } = useAuth();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const onExport = async (): Promise<void> => {
    if (!user) return;
    setExportState('working');
    try {
      const data = await exportUserData(createDataRepository(), user.id);
      const json = JSON.stringify(data, null, 2);
      const filename = `supotsu-export-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
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

  return (
    <Screen scroll>
      <Text variant="title">Réglages</Text>
      <Text variant="caption" color="textMuted">
        Unités, notifications, confidentialité et tes données.
      </Text>

      <Card>
        <Text variant="heading">Profil sportif</Text>
        <Text variant="body" color="textMuted">
          Ton poids, ta taille, ton niveau et tes disponibilités.
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
          <Button label="Modifier mon profil" onPress={() => router.push('/profile/edit')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Unités</Text>
        <View style={{ marginTop: spacing[2] }}>
          <SegmentedControl
            options={UNIT_OPTIONS}
            value={preferences.units}
            onChange={(v) => setPreference('units', v)}
          />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Apparence</Text>
        <Text variant="caption" color="textMuted">
          Thème : {name} (préférence {preference}).
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap', marginTop: spacing[1] }}>
          <Button label="Clair / sombre" onPress={toggle} />
          <Button label="Système" variant="secondary" onPress={() => setThemePref('system')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Notifications</Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <ToggleRow
            label="Bilan du jour"
            hint="Un résumé chaque matin"
            value={preferences.dailyBriefing}
            onValueChange={(v) => setPreference('dailyBriefing', v)}
          />
          <ToggleRow
            label="Rappels"
            hint="Habitudes et check-in bien-être"
            value={preferences.reminders}
            onValueChange={(v) => setPreference('reminders', v)}
          />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Confidentialité</Text>
        <View style={{ marginTop: spacing[2] }}>
          <ToggleRow
            label="Apparaître dans les classements"
            hint="Tes agrégats restent anonymisés par le serveur"
            value={preferences.shareInLeaderboards}
            onValueChange={(v) => setPreference('shareInLeaderboards', v)}
          />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Mes données</Text>
        <Text variant="body" color="textMuted">
          Exporte l'intégralité de tes données au format JSON (RGPD), ou vérifie leur provenance.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] }}>
          <Button
            label={exportState === 'working' ? 'Export…' : 'Exporter mes données'}
            onPress={onExport}
          />
          <Button label="Qualité & provenance" variant="secondary" onPress={() => router.push('/data-quality')} />
        </View>
        {exportState === 'done' ? (
          <Text variant="caption" color="textMuted">
            Export prêt {Platform.OS === 'web' ? '(téléchargé)' : '(partagé)'}.
          </Text>
        ) : null}
        {exportState === 'error' ? (
          <Text variant="caption" style={{ color: '#ef4444' }}>
            L'export a échoué. Réessaie.
          </Text>
        ) : null}
      </Card>

      {mode === 'demo' ? (
        <Text variant="caption" color="textSubtle">
          Mode démo : tes données restent sur cet appareil.
        </Text>
      ) : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
