import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: checkins = [] } = useWellnessCheckins();
  const addCheckin = useAddWellnessCheckin();
  const asOf = new Date().toISOString();

  const BAND_LABEL: Record<WellnessBand, string> = {
    rayonnant: t('wellbeing.wellness.bandLabel.rayonnant'),
    stable: t('wellbeing.wellness.bandLabel.stable'),
    fragile: t('wellbeing.wellness.bandLabel.fragile'),
    difficile: t('wellbeing.wellness.bandLabel.difficile'),
  };

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
      <Text variant="title">{t('wellbeing.wellness.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('wellbeing.wellness.subtitle')}
      </Text>

      {hasData && (
        <Card>
          <View style={{ alignItems: 'center', gap: spacing[1] }}>
            <ProgressRing value={index.value} segments={zones} caption="/100" size={116} />
            <Badge label={BAND_LABEL[band]} tone={BAND_TONE[band]} />
            {streak > 0 && (
              <Text variant="caption" color="textMuted">
                {t('wellbeing.wellness.streak', { count: streak })}
              </Text>
            )}
          </View>
        </Card>
      )}

      <Card>
        <Text variant="heading">{t('wellbeing.wellness.checkinTitle')}</Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <RatingRow
            label={t('wellbeing.wellness.mood.label')}
            hint={t('wellbeing.wellness.mood.hint')}
            value={mood}
            onChange={setMood}
          />
          <RatingRow
            label={t('wellbeing.wellness.energy.label')}
            hint={t('wellbeing.wellness.energy.hint')}
            value={energy}
            onChange={setEnergy}
          />
          <RatingRow
            label={t('wellbeing.wellness.stress.label')}
            hint={t('wellbeing.wellness.stress.hint')}
            value={stress}
            onChange={setStress}
          />
          <Input
            label={t('wellbeing.wellness.noteLabel')}
            placeholder={t('wellbeing.wellness.notePlaceholder')}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label={addCheckin.isPending ? t('wellbeing.wellness.saving') : t('common.save')}
              onPress={onSubmit}
            />
          </View>
        </View>
      </Card>

      {explanation && (
        <Card>
          <Text variant="heading">{t('wellbeing.wellness.analysisTitle')}</Text>
          <Text variant="caption" color="textMuted">
            {t(explanation.observation.key, explanation.observation.params)}
          </Text>
          <Text variant="caption" color="textMuted">
            {t(explanation.analysis.key, explanation.analysis.params)}
          </Text>
          <Text variant="body" style={{ marginTop: spacing[1] }}>
            {t(explanation.action.key, explanation.action.params)}
          </Text>
        </Card>
      )}

      <Card>
        <Text variant="heading">{t('wellbeing.wellness.recoveryTitle')}</Text>
        <Text variant="body" color="textMuted">
          {t('wellbeing.wellness.recoveryBody')}
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
          <Button
            label={t('wellbeing.wellness.openTools')}
            variant="secondary"
            onPress={() => router.push('/sommeil/neuro-recovery')}
          />
        </View>
      </Card>

      {checkins.length > 0 && (
        <Card>
          <Text variant="heading">{t('wellbeing.wellness.historyTitle')}</Text>
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
                  {t('wellbeing.wellness.historyRow', { mood: c.mood, energy: c.energy, stress: c.stress })}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
