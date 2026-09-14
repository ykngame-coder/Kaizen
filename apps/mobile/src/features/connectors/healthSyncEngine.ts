import {
  aggregateHealthKitSleep,
  aggregateHealthKitSleepSessions,
  dayKeysRange,
  normalizeHealthKitSamples,
  normalizeHealthKitWorkout,
  recomputeSleep,
  sleepRereadWindow,
  touchedDayKeys,
  type ImportedActivity,
} from '@supotsu/connectors';
import type { HealthMetricType } from '@supotsu/core';
import type { ReplaceWindow } from '@/lib/data/repository';
import type { Added, ChangeSet, FullRead, HealthSource, HealthTypeKey, PointMetricKey } from './healthSource';
import { fullReplaceWindows } from './replaceWindows';
import { syncWindow, trimToWindow } from './syncWindow';

/**
 * Synchro Apple Santé par ancres.
 * Voir docs/superpowers/specs/2026-09-13-synchro-sante-ancree-design.md.
 *
 * Règle d'or : une ancre n'avance qu'APRÈS un enregistrement réussi. Si
 * l'enregistrement échoue, rien ne bouge et la synchro suivante recommence —
 * toutes les écritures sont idempotentes, rejouer ne crée pas de doublon.
 */

/** Interrupteur de retour arrière : à `false`, chaque demande part en mode complet — le comportement d'avant. */
export const INCREMENTAL_SYNC = true;
/** Filet de sécurité : une relecture complète au moins tous les N jours. */
export const FULL_SYNC_EVERY_DAYS = 7;
/** Une suppression ne dit pas sa date : on relit le type sur cette fenêtre. */
export const DELETION_REFRESH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncMode = 'incremental' | 'full';

export interface AnchorStore {
  get(type: HealthTypeKey): Promise<string | null>;
  set(type: HealthTypeKey, anchor: string): Promise<void>;
  /** Efface les ancres ET la date du dernier complet — la prochaine synchro repart de zéro. */
  clear(): Promise<void>;
  lastFullAt(): Promise<Date | null>;
  setLastFullAt(at: Date): Promise<void>;
}

export interface SyncPayload extends FullRead {
  replace: ReplaceWindow[];
  deletedActivityExternalIds: string[];
}

export interface TypeReport {
  added: number;
  deleted: number;
  error?: string;
}

export interface SyncReport {
  mode: SyncMode;
  /** Pourquoi ce mode : demandé, pas d'ancre, filet hebdomadaire, ancre refusée, interrupteur coupé. */
  reason: 'requested' | 'no-anchor' | 'weekly' | 'anchor-rejected' | 'disabled';
  startedAt: string;
  durationMs: number;
  perType: Partial<Record<HealthTypeKey, TypeReport>>;
  anchorsVia: Partial<Record<HealthTypeKey, 'empty-query' | 'paged' | 'existing'>>;
  /** Renseigné par l'appelant quand la synchro a levé une erreur. */
  error?: string;
}

export interface EngineDeps {
  source: HealthSource;
  anchors: AnchorStore;
  persist(payload: SyncPayload): Promise<void>;
  now(): Date;
}

/** Le type de mesure Supotsu de chaque mesure ponctuelle — celui que vise un remplacement. */
const METRIC_TYPE_OF: Record<PointMetricKey, HealthMetricType> = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_heart_rate',
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierBodyFatPercentage: 'body_fat',
  HKQuantityTypeIdentifierLeanBodyMass: 'muscle_mass',
};

class AnchorRejected extends Error {}

/**
 * Santé ne documente pas l'erreur d'une ancre invalide ; le module natif la
 * relaie sous forme de message. Heuristique volontairement large : se tromper
 * dans ce sens coûte une relecture complète, jamais une donnée.
 */
const isAnchorRejected = (e: unknown): boolean => /anchor/i.test(e instanceof Error ? e.message : String(e));

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const emptyPayload = (): SyncPayload => ({ activities: [], healthMetrics: [], sleepSessions: [], replace: [], deletedActivityExternalIds: [] });

const addedCount = (a: Added): number =>
  a.kind === 'workouts' ? a.workouts.length : a.kind === 'steps' ? a.intervals.length : a.samples.length;

const hasContent = (p: SyncPayload): boolean =>
  p.activities.length + p.healthMetrics.length + p.sleepSessions.length + p.replace.length + p.deletedActivityExternalIds.length > 0;

export async function runHealthSync(deps: EngineDeps, requested: SyncMode): Promise<SyncReport> {
  const started = deps.now();
  const report: SyncReport = {
    mode: requested,
    reason: 'requested',
    startedAt: started.toISOString(),
    durationMs: 0,
    perType: {},
    anchorsVia: {},
  };
  const finish = (): SyncReport => {
    report.durationMs = deps.now().getTime() - started.getTime();
    return report;
  };

  await deps.source.authorize();

  let mode = requested;
  if (!INCREMENTAL_SYNC) {
    mode = 'full';
    report.reason = 'disabled';
  } else if (mode === 'incremental') {
    const anchors = await Promise.all(deps.source.types.map((t) => deps.anchors.get(t)));
    const lastFull = await deps.anchors.lastFullAt();
    if (anchors.some((a) => !a)) {
      mode = 'full';
      report.reason = 'no-anchor';
    } else if (!lastFull || started.getTime() - lastFull.getTime() > FULL_SYNC_EVERY_DAYS * DAY_MS) {
      mode = 'full';
      report.reason = 'weekly';
    }
  }
  report.mode = mode;

  if (mode === 'incremental') {
    try {
      await runIncremental(deps, report);
      return finish();
    } catch (e) {
      if (!(e instanceof AnchorRejected)) throw e;
      await deps.anchors.clear();
      report.mode = 'full';
      report.reason = 'anchor-rejected';
      report.perType = {};
      report.anchorsVia = {};
    }
  }
  await runFull(deps, report);
  return finish();
}

/**
 * Relecture complète. Les ancres sont relevées AVANT la relecture : ce qui
 * arrive pendant qu'elle tourne sera revu la fois suivante — au moins une
 * fois, jamais zéro.
 */
async function runFull(deps: EngineDeps, report: SyncReport): Promise<void> {
  const pending = new Map<HealthTypeKey, string>();
  for (const t of deps.source.types) {
    try {
      const a = await deps.source.currentAnchor(t);
      if (a) {
        pending.set(t, a.anchor);
        report.anchorsVia[t] = a.via;
      }
    } catch (e) {
      report.perType[t] = { added: 0, deleted: 0, error: errorText(e) };
    }
  }

  const read = await deps.source.fullRead();
  const now = deps.now();
  await deps.persist({ ...read, replace: fullReplaceWindows(read, now), deletedActivityExternalIds: [] });

  for (const [t, a] of pending) await deps.anchors.set(t, a);
  await deps.anchors.setLastFullAt(now);

  report.perType.workouts = { added: read.activities.length, deleted: 0, ...report.perType.workouts };
  report.perType.sleep = { added: read.sleepSessions.length, deleted: 0, ...report.perType.sleep };
  report.perType.steps = { added: read.healthMetrics.filter((m) => m.type === 'steps').length, deleted: 0, ...report.perType.steps };
  for (const [key, type] of Object.entries(METRIC_TYPE_OF) as [PointMetricKey, HealthMetricType][]) {
    if (!deps.source.types.includes(key)) continue;
    report.perType[key] = { added: read.healthMetrics.filter((m) => m.type === type).length, deleted: 0, ...report.perType[key] };
  }
}

async function runIncremental(deps: EngineDeps, report: SyncReport): Promise<void> {
  const now = deps.now();
  const payload = emptyPayload();
  const advance = new Map<HealthTypeKey, string>();

  for (const t of deps.source.types) {
    const anchor = await deps.anchors.get(t);
    if (!anchor) continue; // impossible ici : runHealthSync bascule en complet sans toutes les ancres
    report.anchorsVia[t] = 'existing';

    let changes: ChangeSet;
    try {
      changes = await deps.source.changesSince(t, anchor);
    } catch (e) {
      if (isAnchorRejected(e)) throw new AnchorRejected(errorText(e));
      report.perType[t] = { added: 0, deleted: 0, error: errorText(e) };
      continue;
    }

    const counts = { added: addedCount(changes.added), deleted: changes.deletedUuids.length };
    try {
      const part = await applyChanges(deps.source, t, changes, now);
      payload.activities.push(...part.activities);
      payload.healthMetrics.push(...part.healthMetrics);
      payload.sleepSessions.push(...part.sleepSessions);
      payload.replace.push(...part.replace);
      payload.deletedActivityExternalIds.push(...part.deletedActivityExternalIds);
      advance.set(t, changes.newAnchor);
      report.perType[t] = counts;
    } catch (e) {
      // Type écarté du lot, son ancre ne bouge pas : il sera repris la fois suivante.
      report.perType[t] = { ...counts, error: errorText(e) };
    }
  }

  if (hasContent(payload)) await deps.persist(payload);
  for (const [t, a] of advance) await deps.anchors.set(t, a);
}

/** Ce qu'un lot de changements d'un type doit écrire. */
async function applyChanges(source: HealthSource, type: HealthTypeKey, changes: ChangeSet, now: Date): Promise<SyncPayload> {
  const out = emptyPayload();
  const deleted = changes.deletedUuids.length > 0;
  const { since, keepFrom } = syncWindow(DELETION_REFRESH_DAYS, now);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const deletionWindow = (kind: ReplaceWindow['kind']): ReplaceWindow => ({ kind, from: keepFrom.toISOString(), to: tomorrow.toISOString() });
  const a = changes.added;

  switch (a.kind) {
    case 'workouts': {
      out.activities = a.workouts.map(normalizeHealthKitWorkout).filter((x): x is ImportedActivity => x !== null);
      // Exact, quel que soit l'âge : on stocke déjà l'identifiant Santé des séances.
      out.deletedActivityExternalIds = changes.deletedUuids.map((u) => `applehealth-${u}`);
      return out;
    }
    case 'quantity': {
      out.healthMetrics = normalizeHealthKitSamples(a.samples);
      if (deleted) {
        const key = type as PointMetricKey;
        out.healthMetrics.push(...normalizeHealthKitSamples(await source.readQuantity(key, keepFrom, tomorrow)));
        out.replace.push(deletionWindow(METRIC_TYPE_OF[key]));
      }
      return out;
    }
    case 'steps': {
      const days = touchedDayKeys(a.intervals);
      if (days.length > 0) {
        const range = dayKeysRange(days);
        out.healthMetrics.push(...(await source.stepTotals(range.from, range.to)));
      }
      if (deleted) {
        out.healthMetrics.push(...(await source.stepTotals(keepFrom, tomorrow)));
        out.replace.push(deletionWindow('steps'));
      }
      return out;
    }
    case 'sleep': {
      const window = sleepRereadWindow(a.samples);
      if (window) {
        const r = recomputeSleep(await source.readSleep(window.from, window.to), a.samples, window);
        out.sleepSessions.push(...r.sessions);
        out.healthMetrics.push(...r.durations);
        if (r.replace) out.replace.push({ kind: 'sleep_session', ...r.replace });
      }
      if (deleted) {
        // Un jour de marge avant `keepFrom` : la première nuit de la fenêtre commence la veille au soir.
        const samples = await source.readSleep(since, tomorrow);
        const trimmed = trimToWindow(
          { healthMetrics: aggregateHealthKitSleep(samples), sleepSessions: aggregateHealthKitSleepSessions(samples) },
          keepFrom,
        );
        out.sleepSessions.push(...trimmed.sleepSessions);
        out.healthMetrics.push(...trimmed.healthMetrics);
        out.replace.push(deletionWindow('sleep_session'), deletionWindow('sleep_duration'));
      }
      return out;
    }
  }
}
