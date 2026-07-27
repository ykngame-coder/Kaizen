import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { strFromU8, unzipSync } from 'fflate';
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

/** Read a picked file's raw bytes (for zip archives). */
async function readFileBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
        type: ['application/json', 'application/zip', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);

      // Merge every selected file. A whole Garmin export .zip is unzipped in-app
      // and each JSON inside is parsed; individual .json files also work.
      const activities: Parameters<typeof importHealth.mutateAsync>[0]['activities'] = [];
      const healthMetrics: Parameters<typeof importHealth.mutateAsync>[0]['healthMetrics'] = [];
      const records: Parameters<typeof importHealth.mutateAsync>[0]['records'] = [];
      const sleepSessions: Parameters<typeof importHealth.mutateAsync>[0]['sleepSessions'] = [];
      let failed = 0;
      const absorb = (text: string): void => {
        const parsed = parseImportFile(JSON.parse(text));
        activities.push(...parsed.activities);
        healthMetrics.push(...parsed.healthMetrics);
        records.push(...parsed.records);
        sleepSessions.push(...parsed.sleepSessions);
      };

      for (const asset of res.assets) {
        const isZip =
          (asset.name ?? '').toLowerCase().endsWith('.zip') || asset.mimeType === 'application/zip';
        try {
          if (isZip) {
            const files = unzipSync(await readFileBytes(asset.uri));
            for (const [name, data] of Object.entries(files)) {
              if (!name.toLowerCase().endsWith('.json')) continue;
              try {
                absorb(strFromU8(data));
              } catch {
                failed += 1;
              }
            }
          } else {
            absorb(await readFileText(asset.uri));
          }
        } catch {
          failed += 1;
        }
      }

      if (activities.length + healthMetrics.length + records.length + sleepSessions.length === 0) {
        setStatus({
          tone: 'error',
          text: failed > 0 ? `Aucune donnée reconnue (${failed} fichier(s) illisible(s)).` : 'Aucune donnée reconnue.',
        });
        return;
      }
      await importHealth.mutateAsync({ activities, healthMetrics, records, sleepSessions });
      setStatus({
        tone: 'success',
        text:
          `Importé : ${activities.length} activité(s), ${healthMetrics.length} donnée(s) santé, ` +
          `${sleepSessions.length} nuit(s), ${records.length} record(s)` +
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
          Trois formats reconnus automatiquement : l'export de l'app{' '}
          <Text variant="body">Health Auto Export</Text> (Apple Santé → sommeil avec phases,
          poids, FC repos, hydratation, activités…), l'archive <Text variant="body">.zip</Text>{' '}
          d'un export Garmin (dézippée dans l'app), ou des .json Supotsu. Voir
          docs/import-format.md.
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
