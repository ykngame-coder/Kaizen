import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { BackButton } from '@/features/navigation/BackButton';
import { MEDITATION_CATALOG, MEDITATION_CATEGORIES } from './meditationCatalog';

/** Méditation guidée — catalogue par catégorie (Neuro Recovery Suite). */
export function MeditationScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();

  const fmtDuration = (sec: number): string => t('wellbeing.meditation.duration', { m: Math.round(sec / 60) });

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('wellbeing.meditation.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('wellbeing.meditation.subtitle')}
      </Text>

      {MEDITATION_CATEGORIES.map((cat) => {
        const sessions = MEDITATION_CATALOG.filter((s) => s.category === cat.key);
        return (
          <View key={cat.key} style={{ marginTop: spacing[4] }}>
            <Text variant="heading">{cat.icon} {cat.label}</Text>
            <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
              {sessions.map((s) => {
                const card = (
                  <Card style={{ opacity: s.available ? 1 : 0.6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="body" style={{ fontWeight: '600' }}>{s.title}</Text>
                      {s.available ? (
                        <Text variant="caption" color="textSubtle">{fmtDuration(s.durationSec)}</Text>
                      ) : (
                        <Badge label={t('wellbeing.meditation.comingSoon')} tone="neutral" />
                      )}
                    </View>
                  </Card>
                );
                if (!s.available) return <View key={s.id}>{card}</View>;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push({ pathname: '/sommeil/meditation/[id]', params: { id: s.id } })}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    {card}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>
        {t('wellbeing.meditation.footer')}
      </Text>
    </Screen>
  );
}
