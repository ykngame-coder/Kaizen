import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { strFromU8, unzipSync } from 'fflate';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { parseGarminFitWorkout, parseImportFile, type ImportedWorkout } from '@supotsu/connectors';
import { useImportHealth } from '@/lib/data/queries';
import { readFileBytes } from '@/lib/fileBytes';

/**
 * Extract a human-readable message from anything a failed import can throw.
 * `instanceof Error` alone isn't enough here: a network-level Supabase
 * failure (e.g. a slow/dropped request) resolves to a plain
 * `{message, details, hint, code}` object rather than an Error subclass, and
 * a browser localStorage quota error is a DOMException, which doesn't extend
 * Error either. Both still carry a string `.message`.
 */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
    return e.message;
  }
  return 'Import impossible.';
}

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
        type: ['application/json', 'application/zip', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);

      // Merge every selected file. A whole Garmin export .zip is unzipped in-app
      // and each JSON inside is parsed; individual .json files also work. The
      // same export also bundles the raw per-activity .fit files (nested one
      // zip deeper, under DI-Connect-Uploaded-Files/) — those carry exercise
      // sets (reps/weight/category) no JSON file in the export has, so they're
      // decoded too and turned into structured workouts for the muscle map.
      const activities: Parameters<typeof importHealth.mutateAsync>[0]['activities'] = [];
      const healthMetrics: Parameters<typeof importHealth.mutateAsync>[0]['healthMetrics'] = [];
      const records: Parameters<typeof importHealth.mutateAsync>[0]['records'] = [];
      const sleepSessions: Parameters<typeof importHealth.mutateAsync>[0]['sleepSessions'] = [];
      const workouts: ImportedWorkout[] = [];
      let failed = 0;
      const absorb = (text: string): void => {
        const parsed = parseImportFile(JSON.parse(text));
        activities.push(...parsed.activities);
        healthMetrics.push(...parsed.healthMetrics);
        records.push(...parsed.records);
        sleepSessions.push(...parsed.sleepSessions);
      };
      const absorbFit = async (bytes: Uint8Array, externalId: string): Promise<void> => {
        const workout = await parseGarminFitWorkout(bytes, externalId);
        if (workout) workouts.push({ ...workout, source: 'garmin' });
      };

      for (const asset of res.assets) {
        const name = (asset.name ?? '').toLowerCase();
        const isZip = name.endsWith('.zip') || asset.mimeType === 'application/zip';
        const isFit = name.endsWith('.fit');
        try {
          if (isZip) {
            const files = unzipSync(await readFileBytes(asset.uri));
            for (const [entryName, data] of Object.entries(files)) {
              const lower = entryName.toLowerCase();
              if (lower.endsWith('.json')) {
                try {
                  absorb(strFromU8(data));
                } catch {
                  failed += 1;
                }
              } else if (lower.endsWith('.fit')) {
                try {
                  await absorbFit(data, `garmin-fit:${entryName}`);
                } catch {
                  failed += 1;
                }
              } else if (lower.endsWith('.zip')) {
                // Garmin nests one more zip level for the raw per-activity .fit files.
                try {
                  const nested = unzipSync(data);
                  for (const [innerName, innerData] of Object.entries(nested)) {
                    if (!innerName.toLowerCase().endsWith('.fit')) continue;
                    try {
                      await absorbFit(innerData, `garmin-fit:${entryName}/${innerName}`);
                    } catch {
                      failed += 1;
                    }
                  }
                } catch {
                  failed += 1;
                }
              }
            }
          } else if (isFit) {
            await absorbFit(await readFileBytes(asset.uri), `garmin-fit:${asset.name}`);
          } else {
            absorb(await readFileText(asset.uri));
          }
        } catch {
          failed += 1;
        }
      }

      if (activities.length + healthMetrics.length + records.length + sleepSessions.length + workouts.length === 0) {
        setStatus({
          tone: 'error',
          text: failed > 0 ? `Aucune donnée reconnue (${failed} fichier(s) illisible(s)).` : 'Aucune donnée reconnue.',
        });
        return;
      }
      await importHealth.mutateAsync({ activities, healthMetrics, records, sleepSessions, workouts });
      const workoutsNote = workouts.length > 0 ? `, ${workouts.length} séance(s) musculation` : '';
      setStatus({
        tone: 'success',
        text:
          `Importé : ${activities.length} activité(s), ${healthMetrics.length} donnée(s) santé, ` +
          `${sleepSessions.length} nuit(s), ${records.length} record(s)${workoutsNote}` +
          (failed > 0 ? ` (${failed} fichier(s) ignoré(s)).` : '.'),
      });
    } catch (e) {
      setStatus({ tone: 'error', text: `Échec : ${errorMessage(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Importer un fichier</Text>
      <Text variant="caption" color="textMuted">
        Centralise un export santé (Garmin, Apple Santé…) au format JSON Kaizen. Rien n'est
        écrasé : réimporter un fichier ne crée aucun doublon.
      </Text>

      <Card>
        <Text variant="heading">Fichier JSON</Text>
        <Text variant="body" color="textMuted">
          Trois formats reconnus automatiquement : l'export de l'app{' '}
          <Text variant="body">Health Auto Export</Text> (Apple Santé → sommeil avec phases,
          poids, FC repos, hydratation, activités…), l'archive <Text variant="body">.zip</Text>{' '}
          d'un export Garmin (dézippée dans l'app, y compris le détail poids/répétitions de tes
          séances de musculation pour la carte musculaire), ou des .json Kaizen. Voir
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
