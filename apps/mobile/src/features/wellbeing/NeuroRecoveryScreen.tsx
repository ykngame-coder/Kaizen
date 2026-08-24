import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

/**
 * Neuro Recovery Suite hub (cahier des charges §3.7). Gathers relaxation tools:
 * guided breathing, cardiac coherence and (visual) bilateral stimulation.
 *
 * Compliance requirement: the EMDR vs bilateral-stimulation distinction is shown
 * up front, before any use, and the feature is never framed as therapy.
 */
function ToolCard({
  title,
  description,
  actionLabel,
  onPress,
  soon,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress?: () => void;
  soon?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text variant="heading">{title}</Text>
        {soon && <Badge label={t('wellbeing.neuroRecovery.soon')} tone="info" />}
      </View>
      <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
        {description}
      </Text>
      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button
          label={actionLabel}
          variant={soon ? 'secondary' : 'primary'}
          disabled={soon}
          onPress={onPress}
        />
      </View>
    </Card>
  );
}

export function NeuroRecoveryScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen scroll>
      <Text variant="title">{t('wellbeing.neuroRecovery.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('wellbeing.neuroRecovery.subtitle')}
      </Text>

      <Card>
        <Text variant="label" color="warning">
          {t('wellbeing.neuroRecovery.warningLabel')}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {t('wellbeing.neuroRecovery.warningText')}
        </Text>
      </Card>

      <ToolCard
        title={t('wellbeing.neuroRecovery.tools.breathing.title')}
        description={t('wellbeing.neuroRecovery.tools.breathing.description')}
        actionLabel={t('wellbeing.neuroRecovery.open')}
        onPress={() => router.push('/sommeil/breathing')}
      />

      <ToolCard
        title={t('wellbeing.neuroRecovery.tools.bilateral.title')}
        description={t('wellbeing.neuroRecovery.tools.bilateral.description')}
        actionLabel={t('wellbeing.neuroRecovery.open')}
        onPress={() => router.push('/sommeil/bilateral')}
      />

      <ToolCard
        title={t('wellbeing.neuroRecovery.tools.sound.title')}
        description={t('wellbeing.neuroRecovery.tools.sound.description')}
        actionLabel={t('wellbeing.neuroRecovery.open')}
        onPress={() => router.push('/sommeil/sound')}
      />

      <ToolCard
        title={t('wellbeing.neuroRecovery.tools.meditation.title')}
        description={t('wellbeing.neuroRecovery.tools.meditation.description')}
        actionLabel={t('wellbeing.neuroRecovery.open')}
        onPress={() => router.push('/sommeil/meditation')}
      />

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
