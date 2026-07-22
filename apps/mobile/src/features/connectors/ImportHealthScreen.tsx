import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { parseImportFile } from '@supotsu/connectors';
import { useImportHealth } from '@/lib/data/queries';

/** Read a picked file's text, cross-platform (web blob vs native file uri). */
async function readFileText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.text();
  }
  const { readAsStringAsync } = await import('expo-file-system/legacy');
  return readAsStringAsync(uri);
}

/**
 * Import a health export file (JSON) — the free, no-build path to centralize a
 * Garmin / Apple Health export. Parsing is pure + tested; persistence is
 * idempotent (health dedup index), so re-importing an overlapping file only adds
 * what's new.
 */
export function ImportHealthScreen(): React.JSX.Element {
  const router = useRouter();
  const importHealth = useImportHealth();
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const pickAndImport = async (): Promise<void> => {
    setStatus(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);

      // Merge every selected file (a Garmin export is split across many files).
      const activities: Parameters<typeof importHealth.mutateAsync>[0]['activities'] = [];
      const healthMetrics: Parameters<typeof importHealth.mutateAsync>[0]['healthMetrics'] = [];
      let failed = 0;
      for (const asset of res.assets) {
        try {
          const parsed = parseImportFile(JSON.parse(await readFileText(asset.uri)));
          activities.push(...parsed.activities);
          healthMetrics.push(...parsed.healthMetrics);
        } catch {
          failed += 1;
        }
      }

      if (activities.length + healthMetrics.length === 0) {
        setStatus({
          tone: 'error',
          text: failed > 0 ? `Aucune donnée reconnue (${failed} fichier(s) illisible(s)).` : 'Aucune donnée reconnue.',
        });
        return;
      }
      const added = await importHealth.mutateAsync({ activities, healthMetrics });
      setStatus({
        tone: 'success',
        text:
          `Importé : ${added.activities} activité(s), ${added.health} donnée(s) santé` +
          (failed > 0 ? ` (${failed} fichier(s) ignoré(s)).` : '.'),
      });
    } catch (e) {
      setStatus({
        tone: 'error',
        text: e instanceof Error ? `Échec : ${e.message}` : 'Import impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Importer un fichier</Text>
      <Text variant="caption" color="textMuted">
        Centralise un export santé (Garmin, Apple Santé…) au format JSON Supotsu. Rien n'est
        écrasé : réimporter un fichier ne crée aucun doublon.
      </Text>

      <Card>
        <Text variant="heading">Fichier JSON</Text>
        <Text variant="body" color="textMuted">
          Fichiers Garmin (DI-Connect-Wellness : sleepData, userBioMetrics…) reconnus
          automatiquement, ou format JSON Supotsu. Tu peux en sélectionner plusieurs
          d'un coup. Voir docs/import-format.md.
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label={busy ? '…' : 'Choisir un fichier'} onPress={pickAndImport} disabled={busy} />
        </View>
      </Card>

      {status ? <Badge label={status.text} tone={status.tone} /> : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
