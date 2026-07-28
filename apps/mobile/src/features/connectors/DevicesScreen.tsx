import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { CONNECTORS } from '@supotsu/connectors';
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

const GARMIN_STATUS_UI: Record<string, { label: string; tone: BadgeTone }> = {
  connected: { label: 'Connecté', tone: 'success' },
  pending: { label: 'Autorisation en cours', tone: 'warning' },
  revoked: { label: 'Accès révoqué', tone: 'error' },
  disconnected: { label: 'Non connecté', tone: 'neutral' },
};

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
  const sync = useSyncConnector();
  const { data: health = [] } = useHealthMetrics();
  const [message, setMessage] = useState<string | null>(null);

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
      <Text variant="title">Mes appareils</Text>
      <Text variant="body" color="textMuted">
        Connecte tes appareils pour importer automatiquement tes activités et données de santé.
        Chaque donnée conserve sa source et sa fiabilité.
      </Text>

      {message ? <Badge label={message} tone="info" /> : null}

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
