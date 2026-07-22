import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Screen, Text, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { CONNECTORS } from '@supotsu/connectors';
import { useHealthMetrics, useSyncConnector } from '@/lib/data/queries';
import {
  disconnectGarmin,
  fetchGarminStatus,
  garminAvailable,
  startGarminConnect,
} from './garminClient';

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

      <GarminCard />

      <View style={{ gap: spacing[2] }}>
        {CONNECTORS.filter((c) => c.provider !== 'garmin').map((c) => (
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
