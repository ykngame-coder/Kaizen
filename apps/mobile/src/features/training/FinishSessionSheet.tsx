import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { usePreferences } from '@/lib/preferences';
import { formatClock } from './blockRunnerEngine';

export interface FinishSessionSheetProps {
  visible: boolean;
  /** Durée mesurée par le runner, en secondes. */
  elapsedSec: number;
  saving?: boolean;
  onConfirm: (finish: { rpe?: number; durationSec: number }) => void;
  /** Terminer sans noter l'effort — la durée reste enregistrée. */
  onSkip: (finish: { durationSec: number }) => void;
}

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Demandé en fin de séance, avant l'enregistrement : « Le choix du RPE devrait
 * se faire en fin de séance avant l'enregistrement ».
 *
 * Jusqu'ici le runner marquait la séance terminée et quittait l'écran sans rien
 * demander, si bien que la fiche affichait « RPE — » et « Durée — » : le champ
 * existait et s'affichait, mais rien ne l'écrivait jamais. La durée est prise
 * de l'horloge du runner — c'est le seul moment où l'app la connaît.
 *
 * L'échelle suit le réglage de l'utilisateur (RPE ou RIR), comme le fait déjà
 * la saisie par série.
 */
export function FinishSessionSheet({
  visible,
  elapsedSec,
  saving = false,
  onConfirm,
  onSkip,
}: FinishSessionSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const [effort, setEffort] = useState<number | undefined>(undefined);
  const isRir = preferences.effortMetric === 'rir';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onSkip({ durationSec: elapsedSec })}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Card style={{ borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingBottom: spacing[6] }}>
          <Text variant="heading">{t('sport.finishSession.title')}</Text>
          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
            {t('sport.finishSession.duration', { duration: formatClock(elapsedSec) })}
          </Text>

          <Text variant="label" color="textMuted" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>
            {isRir ? t('sport.runner.rir') : t('sport.runner.rpe')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {SCALE.map((n) => (
              <Pressable
                key={n}
                onPress={() => setEffort(n)}
                accessibilityLabel={String(n)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: effort === n ? colors.primary : colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: effort === n ? colors.primary : colors.border,
                }}
              >
                <Text variant="body" style={{ fontWeight: '700', color: effort === n ? '#04140b' : colors.text }}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[5] }}>
            <Button
              label={t('sport.finishSession.skip')}
              variant="secondary"
              onPress={() => onSkip({ durationSec: elapsedSec })}
              disabled={saving}
            />
            <View style={{ flex: 1 }} />
            <Button
              label={saving ? t('sport.finishSession.saving') : t('sport.finishSession.confirm')}
              onPress={() => onConfirm({ rpe: effort, durationSec: elapsedSec })}
              disabled={saving}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
