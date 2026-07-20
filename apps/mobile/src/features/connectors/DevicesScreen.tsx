import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { CONNECTORS } from '@supotsu/connectors';
import { useHealthMetrics, useSyncConnector } from '@/lib/data/queries';

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

      <View style={{ gap: spacing[2] }}>
        {CONNECTORS.map((c) => (
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
