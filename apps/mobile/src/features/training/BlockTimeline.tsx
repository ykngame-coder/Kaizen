import React from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { WorkoutBlock } from '@supotsu/core';

export interface BlockTimelineProps {
  workoutName: string;
  blocks: WorkoutBlock[];
  activeIndex: number;
  onContinue: () => void;
  onSkip: () => void;
}

function formatChip(block: WorkoutBlock, t: ReturnType<typeof useTranslation>['t']): string {
  if (block.format === 'amrap') {
    return block.timeCapSec ? `AMRAP · ${Math.round(block.timeCapSec / 60)} min` : 'AMRAP';
  }
  if (block.format === 'emom') return 'EMOM';
  if (block.format === 'for_time') return t('sport.circuitRunner.format.forTime');
  return t('sport.circuitRunner.format.strength');
}

/**
 * Fil des blocs d'une séance multi-blocs (Lot 2b) : où on en est, ce qui reste.
 * Affiché seulement au-delà d'un bloc — pour un bloc unique il n'ajouterait
 * qu'une étape sans information.
 */
export function BlockTimeline({
  workoutName,
  blocks,
  activeIndex,
  onContinue,
  onSkip,
}: BlockTimelineProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="title">{workoutName}</Text>
        <Text variant="caption" color="textSubtle">
          {t('sport.circuitRunner.blockCounter', { current: activeIndex + 1, total: blocks.length })}
        </Text>
      </View>

      {/* Barre segmentée : un segment par bloc. */}
      <View style={{ flexDirection: 'row', gap: spacing[1] }}>
        {blocks.map((b, i) => (
          <View
            key={b.id}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i < activeIndex ? colors.success : i === activeIndex ? colors.primary : colors.surfaceElevated,
            }}
          />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing[3] }}>
        {blocks.map((b, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <View key={b.id} style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: isDone ? colors.success : isActive ? colors.primary : colors.border,
                  backgroundColor: isActive ? colors.primary : 'transparent',
                }}
              >
                <Text variant="caption" style={{ color: isActive ? colors.background : colors.text }}>
                  {isDone ? '✓' : String(i + 1)}
                </Text>
              </View>

              <Card
                style={{
                  flex: 1,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? colors.primary : colors.border,
                  opacity: isDone ? 0.7 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Badge label={formatChip(b, t)} tone={isActive ? 'info' : 'neutral'} />
                  <Text variant="caption" color="textSubtle" style={{ marginLeft: 'auto' }}>
                    {isDone
                      ? t('sport.runner.blockDone')
                      : isActive
                        ? t('sport.runner.blockInProgress')
                        : t('sport.runner.blockUpcoming')}
                  </Text>
                </View>
                {isActive ? (
                  <View style={{ marginTop: spacing[3] }}>
                    <Button label={t('sport.runner.continueBlock')} onPress={onContinue} />
                  </View>
                ) : null}
              </Card>
            </View>
          );
        })}
      </ScrollView>

      <Button label={t('sport.runner.skipBlock')} variant="secondary" onPress={onSkip} />
    </View>
  );
}
