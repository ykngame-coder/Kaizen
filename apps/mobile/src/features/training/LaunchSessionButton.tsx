import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { SetEntry } from '@supotsu/core';
import { hasHomeAlternative } from './launchSession';

/**
 * "Démarrer"/"Lancer" button for a planned or in-progress workout. If any of
 * its sets carries a home alternative, tapping it opens an inline salle/maison
 * choice instead of navigating straight to the runner — shared by
 * `WorkoutDetailScreen` and `PlanningScreen`'s `SessionCard` so every launch
 * surface offers the same choice.
 */
export function LaunchSessionButton({
  workoutId,
  sets,
  resume,
  startLabel,
  fullWidth,
}: {
  workoutId: string;
  sets: SetEntry[];
  resume: boolean;
  startLabel: string;
  fullWidth?: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const [choosingLocation, setChoosingLocation] = useState(false);
  const hasAlternatives = hasHomeAlternative(sets);

  if (choosingLocation) {
    return (
      <Card>
        <Text variant="subtitle">{t('sport.workoutDetail.locationChoice.title')}</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
          {t('sport.workoutDetail.locationChoice.subtitle')}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3], flexWrap: 'wrap' }}>
          <Button label={t('common.cancel')} variant="secondary" onPress={() => setChoosingLocation(false)} />
          <Button
            label={t('sport.workoutDetail.locationChoice.gym')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workoutId } })}
          />
          <Button
            label={t('sport.workoutDetail.locationChoice.home')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/sport/workout/[id]/run', params: { id: workoutId, mode: 'home' } })}
          />
        </View>
      </Card>
    );
  }

  return (
    <View style={fullWidth ? undefined : { alignItems: 'flex-start' }}>
      <Button
        label={resume ? t('sport.runner.resume') : startLabel}
        onPress={() => {
          if (hasAlternatives) setChoosingLocation(true);
          else router.push({ pathname: '/sport/workout/[id]/run', params: { id: workoutId } });
        }}
        fullWidth={fullWidth}
      />
    </View>
  );
}
