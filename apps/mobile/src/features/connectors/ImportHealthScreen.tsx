import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { strFromU8, unzipSync } from 'fflate';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { parseGarminFitWorkoutsBatch, parseImportFile, type ImportedWorkout } from '@supotsu/connectors';
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
function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
    return e.message;
  }
  return t('connectors.importHealth.importImpossible');
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
  const { t } = useTranslation();
  const router = useRouter();
  const importHealth = useImportHealth();
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(
    null,
  );
  const [importedWorkouts, setImportedWorkouts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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
      // A multi-year account nests one .fit per *every* recorded activity
      // (runs, rides… not just strength), tens of thousands of files — they're
      // collected here and parsed as a single batch below (with progress),
      // instead of awaited one by one inline, so a long import doesn't peg the
      // JS thread and read as a hang.
      const activities: Parameters<typeof importHealth.mutateAsync>[0]['activities'] = [];
      const healthMetrics: Parameters<typeof importHealth.mutateAsync>[0]['healthMetrics'] = [];
      const records: Parameters<typeof importHealth.mutateAsync>[0]['records'] = [];
      const sleepSessions: Parameters<typeof importHealth.mutateAsync>[0]['sleepSessions'] = [];
      const fitEntries: { name: string; bytes: Uint8Array }[] = [];
      let failed = 0;
      const absorb = (text: string): void => {
        const parsed = parseImportFile(JSON.parse(text));
        activities.push(...parsed.activities);
        healthMetrics.push(...parsed.healthMetrics);
        records.push(...parsed.records);
        sleepSessions.push(...parsed.sleepSessions);
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
                fitEntries.push({ name: `garmin-fit:${entryName}`, bytes: data });
              } else if (lower.endsWith('.zip')) {
                // Garmin nests one more zip level for the raw per-activity .fit files.
                try {
                  const nested = unzipSync(data);
                  for (const [innerName, innerData] of Object.entries(nested)) {
                    if (!innerName.toLowerCase().endsWith('.fit')) continue;
                    fitEntries.push({ name: `garmin-fit:${entryName}/${innerName}`, bytes: innerData });
                  }
                } catch {
                  failed += 1;
                }
              }
            }
          } else if (isFit) {
            fitEntries.push({ name: `garmin-fit:${asset.name}`, bytes: await readFileBytes(asset.uri) });
          } else {
            absorb(await readFileText(asset.uri));
          }
        } catch {
          failed += 1;
        }
      }

      let workouts: ImportedWorkout[] = [];
      if (fitEntries.length > 0) {
        setProgress({ done: 0, total: fitEntries.length });
        const result = await parseGarminFitWorkoutsBatch(fitEntries, { onProgress: setProgress });
        workouts = result.workouts.map((w) => ({ ...w, source: 'garmin' as const }));
        failed += result.failed.length;
        setProgress(null);
      }

      if (activities.length + healthMetrics.length + records.length + sleepSessions.length + workouts.length === 0) {
        setStatus({
          tone: 'error',
          text: failed > 0
            ? t('connectors.importHealth.noDataRecognizedWithFailed', { count: failed })
            : t('connectors.importHealth.noDataRecognized'),
        });
        return;
      }
      // Use the persisted counts, not the pre-DB parsed lengths — an upsert
      // can silently create fewer rows than were parsed (e.g. re-importing
      // an overlapping export, where most rows are legitimate no-op dupes),
      // and the message should reflect what's actually in the database.
      const persisted = await importHealth.mutateAsync({ activities, healthMetrics, records, sleepSessions, workouts });
      const workoutsNote = persisted.workouts > 0 ? t('connectors.importHealth.workoutsNote', { count: persisted.workouts }) : '';
      setImportedWorkouts(persisted.workouts);
      const base = t('connectors.importHealth.imported', {
        activities: persisted.activities,
        health: persisted.health,
        sleep: persisted.sleep,
        records: records.length,
        workoutsNote,
      });
      const suffix = failed > 0 ? t('connectors.importHealth.ignoredFilesSuffix', { count: failed }) : '.';
      setStatus({
        tone: 'success',
        text: base + suffix,
      });
    } catch (e) {
      setStatus({ tone: 'error', text: t('connectors.importHealth.failed', { message: errorMessage(e, t) }) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('connectors.importHealth.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('connectors.importHealth.subtitle')}
      </Text>

      <Card>
        <Text variant="heading">{t('connectors.importHealth.jsonFile.title')}</Text>
        <Text variant="body" color="textMuted">
          {t('connectors.importHealth.jsonFile.formatsIntro')}{' '}
          <Text variant="body">Health Auto Export</Text> {t('connectors.importHealth.jsonFile.formatsMiddle')}{' '}
          <Text variant="body">.zip</Text>{' '}
          {t('connectors.importHealth.jsonFile.formatsEnd')}
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label={busy ? '…' : t('connectors.importHealth.jsonFile.chooseFile')} onPress={pickAndImport} disabled={busy} />
        </View>
        {progress ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2] }}>
            {t('connectors.importHealth.jsonFile.analyzing', { done: progress.done, total: progress.total })}
          </Text>
        ) : null}
      </Card>

      {status ? <Badge label={status.text} tone={status.tone} /> : null}

      {/* This card's sole purpose was to open NewWorkoutScreen's "importer une
          séance déjà faite" picker (?openPicker=1) — paused along with it. */}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
