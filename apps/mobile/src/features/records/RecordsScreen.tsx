import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { PersonalRecord, RecordCategory } from '@supotsu/core';
import { useRecords } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const CATEGORY_LABEL: Record<RecordCategory, string> = {
  run: 'Course',
  strength: 'Force',
  cycling: 'Vélo',
  steps: 'Pas',
  other: 'Autre',
};

/** Human value: run times as mm:ss, distances as km, weights as kg, steps grouped. */
function formatValue(r: PersonalRecord): string {
  if (r.unit === 's') {
    const total = Math.round(r.value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }
  if (r.unit === 'm') return r.value >= 1000 ? `${(r.value / 1000).toFixed(2)} km` : `${Math.round(r.value)} m`;
  if (r.unit === 'kg') return `${r.value} kg`;
  if (r.unit === 'steps') return `${Math.round(r.value).toLocaleString('fr-FR')} pas`;
  return `${r.value} ${r.unit}`;
}

/** Personal records / benchmarks, grouped by category (Master Prompt P3). */
export function RecordsScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: records = [], isLoading } = useRecords();

  const groups = useMemo(() => {
    const map = new Map<RecordCategory, PersonalRecord[]>();
    for (const r of records) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    // Best-first within a group: strength/steps/distance desc, run time asc.
    for (const [cat, list] of map) {
      list.sort((a, b) => (cat === 'run' && a.unit === 's' ? a.value - b.value : b.value - a.value));
    }
    return [...map.entries()];
  }, [records]);

  return (
    <Screen scroll>
      <Text variant="title">Mes records</Text>
      <Text variant="caption" color="textMuted">
        Tes meilleures performances — 1RM, meilleurs temps, distances… importées de Garmin.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : records.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Aucun record. Importe ton export Garmin (Mes appareils → Importer un fichier) pour voir
            tes 1RM et tes meilleurs temps.
          </Text>
        </Card>
      ) : (
        groups.map(([category, list]) => (
          <Card key={category}>
            <Text variant="heading">{CATEGORY_LABEL[category]}</Text>
            <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
              {list.map((r) => (
                <View
                  key={r.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <View style={{ flex: 1, paddingRight: spacing[2] }}>
                    <Text variant="body">{r.label}</Text>
                    <Text variant="caption" color="textMuted">
                      {formatDate(r.achievedAt)}
                    </Text>
                  </View>
                  <Badge label={formatValue(r)} tone="info" />
                </View>
              ))}
            </View>
          </Card>
        ))
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
