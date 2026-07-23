import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  Input,
  ProgressRing,
  Screen,
  SegmentedControl,
  Text,
  useTheme,
} from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import {
  computeWellnessIndex,
  wellnessBand,
  wellnessExplanation,
  wellnessStreak,
  type WellnessBand,
} from '@supotsu/engines';
import { useAddWellnessCheckin, useWellnessCheckins } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const BAND_LABEL: Record<WellnessBand, string> = {
  rayonnant: 'Rayonnant',
  stable: 'Stable',
  fragile: 'Fragile',
  difficile: 'Difficile',
};
const BAND_TONE: Record<WellnessBand, 'success' | 'info' | 'warning' | 'error'> = {
  rayonnant: 'success',
  stable: 'info',
  fragile: 'warning',
  difficile: 'error',
};

const RATING_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
] as const;

function RatingRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}): React.JSX.Element {
  return (
    <View style={{ gap: spacing[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" color="textMuted">
          {label.toUpperCase()}
        </Text>
        <Text variant="caption" color="textSubtle">
          {hint}
        </Text>
      </View>
      <SegmentedControl
        options={RATING_OPTIONS}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
      />
    </View>
  );
}

/** Mental-wellness pillar (Master Prompt P14): subjective check-in + index. */
export function WellnessScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: checkins = [] } = useWellnessCheckins();
  const addCheckin = useAddWellnessCheckin();
  const asOf = new Date().toISOString();

  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(3);
  const [note, setNote] = useState('');

  const index = useMemo(() => computeWellnessIndex(checkins, asOf), [checkins, asOf]);
  const streak = useMemo(() => wellnessStreak(checkins, asOf), [checkins, asOf]);
  const explanation = useMemo(() => wellnessExplanation(checkins, asOf), [checkins, asOf]);
  const hasData = index.confidence !== 'to_confirm';
  const band = wellnessBand(index.value);

  const zones = [
    { color: colors.error, weight: 50 },
    { color: colors.warning, weight: 25 },
    { color: colors.success, weight: 25 },
  ];

  const onSubmit = (): void => {
    addCheckin.mutate(
      { mood, energy, stress, note: note.trim() || undefined },
      { onSuccess: () => setNote('') },
    );
  };

  return (
    <Screen scroll>
      <Text variant="title">Bien-être mental</Text>
      <Text variant="caption" color="textMuted">
        Comment tu te sens vraiment — ton ressenti, jamais déduit de tes capteurs.
      </Text>

      {hasData && (
        <Card>
          <View style={{ alignItems: 'center', gap: spacing[1] }}>
            <ProgressRing value={index.value} segments={zones} caption="/100" size={116} />
            <Badge label={BAND_LABEL[band]} tone={BAND_TONE[band]} />
            {streak > 0 && (
              <Text variant="caption" color="textMuted">
                🔥 {streak} jour{streak > 1 ? 's' : ''} de suivi d'affilée
              </Text>
            )}
          </View>
        </Card>
      )}

      <Card>
        <Text variant="heading">Check-in du jour</Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <RatingRow label="Humeur" hint="1 = maussade · 5 = au top" value={mood} onChange={setMood} />
          <RatingRow label="Énergie" hint="1 = épuisé · 5 = plein d'énergie" value={energy} onChange={setEnergy} />
          <RatingRow label="Stress" hint="1 = serein · 5 = débordé" value={stress} onChange={setStress} />
          <Input
            label="Note (optionnel)"
            placeholder="Un mot sur ta journée…"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label={addCheckin.isPending ? 'Enregistrement…' : 'Enregistrer'}
              onPress={onSubmit}
            />
          </View>
        </View>
      </Card>

      {explanation && (
        <Card>
          <Text variant="heading">Analyse</Text>
          <Text variant="caption" color="textMuted">
            {explanation.observation}
          </Text>
          <Text variant="caption" color="textMuted">
            {explanation.analysis}
          </Text>
          <Text variant="body" style={{ marginTop: spacing[1] }}>
            {explanation.action}
          </Text>
        </Card>
      )}

      <Card>
        <Text variant="heading">Respiration guidée</Text>
        <Text variant="body" color="textMuted">
          Une minute de respiration en carré pour faire redescendre la pression.
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
          <Button label="Démarrer la respiration" variant="secondary" onPress={() => router.push('/breathing')} />
        </View>
      </Card>

      {checkins.length > 0 && (
        <Card>
          <Text variant="heading">Historique</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {checkins.slice(0, 7).map((c) => (
              <View
                key={c.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <View style={{ flex: 1, paddingRight: spacing[2] }}>
                  <Text variant="body">{formatDate(c.checkedAt)}</Text>
                  {c.note ? (
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {c.note}
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" color="textMuted">
                  😊 {c.mood} · ⚡ {c.energy} · 🌡️ {c.stress}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
