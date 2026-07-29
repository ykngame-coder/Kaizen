import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { CONNECTORS } from '@supotsu/connectors';
import type { DataSource, HealthMetricType } from '@supotsu/core';
import { useHealthMetrics, useSyncConnector } from '@/lib/data/queries';
import {
  disconnectGarmin,
  fetchGarminStatus,
  garminAvailable,
  startGarminConnect,
} from './garminClient';
import {
  disconnectStrava,
  fetchStravaStatus,
  startStravaConnect,
  stravaAvailable,
  syncStrava,
} from './stravaClient';
import { appleHealthAvailable, createIngestToken, ingestUrl } from './appleHealthClient';

const SOURCE_LABEL: Partial<Record<DataSource, { name: string; icon: string }>> = {
  garmin: { name: 'Garmin', icon: '⌚' },
  apple_health: { name: 'Apple Santé', icon: '🍎' },
  renpho: { name: 'Renpho', icon: '⚖' },
  withings: { name: 'Withings', icon: '⚖' },
  polar: { name: 'Polar', icon: '❤️' },
  coros: { name: 'Coros', icon: '⌚' },
  oura: { name: 'Oura', icon: '💍' },
  fitbit: { name: 'Fitbit', icon: '⌚' },
  manual: { name: 'Saisie manuelle', icon: '✍️' },
};

const METRIC_LABEL: Partial<Record<HealthMetricType, string>> = {
  sleep_duration: 'Sommeil',
  hrv: 'HRV',
  resting_heart_rate: 'FC repos',
  weight: 'Poids',
  body_fat: 'Masse grasse',
  muscle_mass: 'Masse musc.',
};

/** Supported devices shown in the compatibility grid. */
const COMPATIBLE = ['Garmin', 'Apple Watch', 'Polar', 'Coros', 'Whoop', 'Oura', 'Withings', 'Renpho', 'Fitbit', 'Wahoo', 'Dexcom', 'Strava'];

const GARMIN_STATUS_UI: Record<string, { label: string; tone: BadgeTone }> = {
  connected: { label: 'Connecté', tone: 'success' },
  pending: { label: 'Autorisation en cours', tone: 'warning' },
  revoked: { label: 'Accès révoqué', tone: 'error' },
  disconnected: { label: 'Non connecté', tone: 'neutral' },
};

/** Summary KPI cell (2-up). */
function KpiCell({ value, label, small, color }: { value: string; label: string; small?: boolean; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant={small ? 'subtitle' : 'data'} style={{ color: color ?? colors.text, ...(small ? { fontSize: 18 } : {}) }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

/** Real Garmin connection card (OAuth via the Garmin Edge Function). */
function GarminCard(): React.JSX.Element {
  const available = garminAvailable();
  const status = useQuery({
    queryKey: ['garminStatus'],
    queryFn: fetchGarminStatus,
    enabled: available,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = GARMIN_STATUS_UI[status.data ?? 'disconnected'];

  const connect = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await startGarminConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await disconnectGarmin();
      await status.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Déconnexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  const connected = status.data === 'connected' || status.data === 'pending';

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Garmin Connect</Text>
          <Text variant="caption" color="textMuted">
            Activités · Santé (sommeil, HRV, FC, stress)
          </Text>
        </View>
        <Badge label={available ? ui.label : 'Backend requis'} tone={available ? ui.tone : 'neutral'} />
      </View>
      {available ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {connected ? (
            <Button
              label={busy ? '…' : 'Déconnecter'}
              variant="danger"
              onPress={disconnect}
              disabled={busy}
            />
          ) : (
            <Button label={busy ? '…' : 'Connecter Garmin'} onPress={connect} disabled={busy} />
          )}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          Nécessite un backend Supabase configuré et la fonction Garmin déployée (voir
          docs/connectors-garmin.md).
        </Text>
      )}
      {error ? (
        <Text variant="caption" style={{ marginTop: spacing[1] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

/** Real Strava connection card (OAuth2 + pull sync via the Strava Edge Function). */
function StravaCard(): React.JSX.Element {
  const available = stravaAvailable();
  const status = useQuery({
    queryKey: ['stravaStatus'],
    queryFn: fetchStravaStatus,
    enabled: available,
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const connected = status.data === 'connected';

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setNote(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Strava</Text>
          <Text variant="caption" color="textMuted">
            Activités en direct (ta Garmin y synchronise déjà tes séances)
          </Text>
        </View>
        <Badge
          label={available ? (connected ? 'Connecté' : status.data === 'pending' ? 'En cours' : 'Non connecté') : 'Backend requis'}
          tone={available ? (connected ? 'success' : 'neutral') : 'neutral'}
        />
      </View>
      {available ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {connected ? (
            <>
              <Button
                label={busy ? '…' : 'Synchroniser'}
                onPress={() =>
                  run(async () => {
                    const n = await syncStrava();
                    setNote(n === 0 ? 'Déjà à jour.' : `${n} activité(s) importée(s).`);
                    qc.invalidateQueries({ queryKey: ['activities'] });
                  })
                }
                disabled={busy}
              />
              <Button
                label="Déconnecter"
                variant="danger"
                onPress={() => run(async () => { await disconnectStrava(); await status.refetch(); })}
                disabled={busy}
              />
            </>
          ) : (
            <Button label={busy ? '…' : 'Connecter Strava'} onPress={() => run(startStravaConnect)} disabled={busy} />
          )}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          Nécessite un backend Supabase configuré et la fonction Strava déployée (voir
          docs/connectors-strava.md).
        </Text>
      )}
      {note ? (
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

/** Apple Santé via iOS Shortcuts webhook (free, no dev build). */
function AppleHealthCard(): React.JSX.Element {
  const { colors } = useTheme();
  const available = appleHealthAvailable();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = ingestUrl();

  const generate = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      setToken(await createIngestToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Génération impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Apple Santé (Raccourcis)</Text>
          <Text variant="caption" color="textMuted">
            HRV, FC, sommeil — automatique, gratuit, sans build (iOS)
          </Text>
        </View>
        <Badge label={available ? 'Gratuit' : 'Backend requis'} tone={available ? 'success' : 'neutral'} />
      </View>
      {available ? (
        <>
          <Button label={busy ? '…' : token ? 'Régénérer le jeton' : 'Générer mon jeton'} onPress={generate} disabled={busy} />
          {token && url ? (
            <View style={{ gap: spacing[1], marginTop: spacing[1] }}>
              <Text variant="label" color="textMuted">
                URL (à mettre dans le Raccourci)
              </Text>
              <Text variant="caption" selectable style={{ color: colors.text }}>
                {url}
              </Text>
              <Text variant="label" color="textMuted">
                JETON (en-tête X-Supotsu-Token)
              </Text>
              <Text variant="caption" selectable style={{ color: colors.text }}>
                {token}
              </Text>
              <Text variant="caption" color="textMuted">
                Garde ce jeton secret. Suit docs/apple-health-shortcut.md pour créer le Raccourci.
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text variant="caption" color="textMuted">
          Nécessite un backend Supabase configuré et la fonction apple-health déployée
          (voir docs/apple-health-shortcut.md).
        </Text>
      )}
      {error ? (
        <Text variant="caption" style={{ marginTop: spacing[1] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Renpho smart scale. Renpho has no public API, but it writes body composition
 * into Apple Santé — so its data reaches Supotsu through the Apple Santé / Health
 * Auto Export import and is attributed to the 'renpho' source. This card surfaces
 * that bridge and how many Renpho measurements were detected.
 */
function RenphoCard(): React.JSX.Element {
  const { data: health = [] } = useHealthMetrics();
  const renpho = health.filter((m) => m.source === 'renpho');
  const connected = renpho.length > 0;
  const days = new Set(renpho.map((m) => m.measuredAt.slice(0, 10))).size;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Renpho (balance)</Text>
          <Text variant="caption" color="textMuted">
            Poids, masse grasse, masse musculaire — via Apple Santé
          </Text>
        </View>
        <Badge
          label={connected ? 'Synchronisé' : 'Via Apple Santé'}
          tone={connected ? 'success' : 'neutral'}
        />
      </View>
      {connected ? (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {renpho.length} mesure(s) sur {days} jour(s) détectée(s) depuis ta balance Renpho.
        </Text>
      ) : (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          Pèse-toi avec l'app Renpho (sync Apple Santé activée), puis importe ton export Apple
          Santé — le poids et la composition corporelle apparaîtront ici.
        </Text>
      )}
    </Card>
  );
}

/** "Mes appareils connectés" (Master Prompt P9.13, P22.14). */
export function DevicesScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const sync = useSyncConnector();
  const { data: health = [] } = useHealthMetrics();
  const [message, setMessage] = useState<string | null>(null);

  // Real breakdown of imported data by source.
  const bySource = React.useMemo(() => {
    const map = new Map<DataSource, { count: number; types: Set<HealthMetricType> }>();
    for (const m of health) {
      const e = map.get(m.source) ?? { count: 0, types: new Set<HealthMetricType>() };
      e.count += 1;
      e.types.add(m.type);
      map.set(m.source, e);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [health]);

  const lastSync = React.useMemo(() => {
    if (health.length === 0) return null;
    return health.reduce((max, m) => (m.measuredAt > max ? m.measuredAt : max), health[0]!.measuredAt);
  }, [health]);

  const fmtAgo = (iso: string): string => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `il y a ${Math.max(1, mins)} min`;
    const h = Math.round(mins / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  };

  const runSync = async (provider: 'demo'): Promise<void> => {
    setMessage(null);
    try {
      const res = await sync.mutateAsync(provider);
      setMessage(
        res.activities + res.health === 0
          ? 'Déjà à jour — aucune nouvelle donnée.'
          : `Importé : ${res.activities} activité(s), ${res.health} donnée(s) santé.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Synchronisation impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Appareils & capteurs</Text>
      <Text variant="caption" color="textSubtle">
        Synchronisation • Connexions • Sources
      </Text>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <KpiCell value={`${bySource.length}`} label="Sources actives" />
        <KpiCell value={`${health.length}`} label="Données santé" />
        <KpiCell value={lastSync ? fmtAgo(lastSync) : '—'} label="Dernière donnée" small />
        <KpiCell value={health.length > 0 ? 'Actif' : 'En attente'} label="État général" small color={health.length > 0 ? colors.accentData : colors.textMuted} />
      </View>

      {message ? <Badge label={message} tone="info" /> : null}

      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Applications & appareils
      </Text>
      <AppleHealthCard />
      <RenphoCard />
      <GarminCard />
      <StravaCard />

      <View style={{ gap: spacing[2] }}>
        {CONNECTORS.filter((c) => c.provider !== 'garmin' && c.provider !== 'strava').map((c) => (
          <Card key={c.provider}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="subtitle">{c.name}</Text>
                <Text variant="caption" color="textMuted">
                  {c.capabilities.includes('activities') ? 'Activités' : ''}
                  {c.capabilities.length === 2 ? ' · ' : ''}
                  {c.capabilities.includes('health') ? 'Santé' : ''}
                </Text>
              </View>
              {c.available ? (
                <Button
                  label={sync.isPending ? '…' : 'Synchroniser'}
                  onPress={() => runSync('demo')}
                  disabled={sync.isPending}
                />
              ) : (
                <Badge label="À venir" tone="neutral" />
              )}
            </View>
          </Card>
        ))}
      </View>

      {/* Données par source (réel) */}
      {bySource.length > 0 ? (
        <Card>
          <Text variant="heading">Données par source</Text>
          <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
            {bySource.map(([source, info]) => {
              const meta = SOURCE_LABEL[source] ?? { name: source, icon: '📡' };
              return (
                <View key={source} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
                  <View style={{ width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 19 }}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="body" style={{ fontWeight: '700' }}>
                        {meta.name}
                      </Text>
                      <Text variant="caption" color="textSubtle">
                        {info.count} donnée{info.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {[...info.types].map((t) => (
                        <View key={t} style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text variant="caption" color="textMuted">
                            {METRIC_LABEL[t] ?? t}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* Compatibilité */}
      <Card>
        <Text variant="heading">Compatibilité</Text>
        <Text variant="caption" color="textSubtle">
          Appareils et services pris en charge par Kaizen.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
          {COMPATIBLE.map((d) => (
            <View key={d} style={{ backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }}>
              <Text variant="caption" color="textMuted">
                {d}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text variant="heading">Importer un fichier</Text>
        <Text variant="body" color="textMuted">
          Centralise un export Garmin / Apple Santé (JSON). Gratuit, sans compte tiers.
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Importer un fichier" onPress={() => router.push('/import')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Données santé importées</Text>
        <Text variant="body" color="textMuted">
          {health.length === 0
            ? 'Aucune donnée santé pour le moment.'
            : `${health.length} mesures (sommeil, HRV, fréquence cardiaque…).`}
        </Text>
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
