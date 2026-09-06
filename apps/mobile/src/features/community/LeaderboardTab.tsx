import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Icon, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing, radii } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaderboard, useLeaderboardPrefs, useUpdateLeaderboardPrefs } from '@/lib/data/queries';
import { defaultDisplayName, type LeaderboardCategory, type LeaderboardPeriod } from './leaderboardHelpers';

export function LeaderboardTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: prefs } = useLeaderboardPrefs();
  const updatePrefs = useUpdateLeaderboardPrefs();
  const [category, setCategory] = useState<LeaderboardCategory>('general');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const { data: entries = [], isLoading } = useLeaderboard(category, period);

  const CATEGORY_OPTIONS: { value: LeaderboardCategory; label: string }[] = [
    { value: 'general', label: t('community.leaderboard.category.general') },
    { value: 'sport', label: t('community.leaderboard.category.sport') },
    { value: 'nutrition', label: t('community.leaderboard.category.nutrition') },
    { value: 'sleep', label: t('community.leaderboard.category.sleep') },
  ];
  const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
    { value: 'week', label: t('community.leaderboard.period.week') },
    { value: 'quarter', label: t('community.leaderboard.period.quarter') },
    { value: 'year', label: t('community.leaderboard.period.year') },
  ];

  const optedIn = prefs?.leaderboardOptIn ?? false;
  const meRanked = entries.some((e) => e.userId === user?.id);

  return (
    <View style={{ gap: spacing[3] }}>
      {!optedIn ? (
        <Card>
          <Text variant="heading">{t('community.leaderboard.optIn.title')}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>
            {t('community.leaderboard.optIn.message')}
          </Text>
          <View style={{ marginTop: spacing[2] }}>
            <SegmentedControl
              options={[
                { value: 'no' as const, label: t('settings.profileEdit.leaderboardOptIn.no') },
                { value: 'yes' as const, label: t('settings.profileEdit.leaderboardOptIn.yes') },
              ]}
              value="no"
              onChange={(v) => {
                const nextOptedIn = v === 'yes';
                updatePrefs.mutate({
                  leaderboardOptIn: nextOptedIn,
                  // Opting in from here would otherwise leave everyone as a bare "Athlète".
                  displayName: nextOptedIn && !prefs?.displayName && user ? defaultDisplayName(user.id) : undefined,
                });
              }}
            />
          </View>
        </Card>
      ) : null}

      <SegmentedControl options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />

      {/* Le classement est une moyenne sur la période, là où le Dashboard et
          les hubs montrent le score du jour. Sans le dire, l'écart entre les
          deux passe pour une incohérence (retour TestFlight). */}
      <Text variant="caption" color="textSubtle">
        {t('community.leaderboard.averageHint', { period: PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? '' })}
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="fire" size={44} color={colors.textSubtle} />}
          title={t('community.leaderboard.emptyState.title')}
          message={t('community.leaderboard.emptyState.message')}
        />
      ) : (
        <View style={{ gap: spacing[2] }}>
          {entries.map((e) => {
            const isMe = e.userId === user?.id;
            return (
              <View
                key={e.userId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[3],
                  padding: spacing[3],
                  borderRadius: radii.lg,
                  backgroundColor: isMe ? colors.surfaceElevated : colors.surface,
                  borderWidth: isMe ? 1.5 : 1,
                  borderColor: isMe ? colors.primary : colors.border,
                }}
              >
                <Text variant="subtitle" style={{ width: 28 }}>
                  {e.rank}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '700' }}>
                    {isMe ? t('community.leaderboard.you') : e.displayName}
                  </Text>
                </View>
                <Text variant="subtitle">{e.avgScore}</Text>
              </View>
            );
          })}
        </View>
      )}

      {optedIn && !isLoading && entries.length > 0 && !meRanked ? (
        <Text variant="caption" color="textSubtle">
          {t('community.leaderboard.notRanked')}
        </Text>
      ) : null}
    </View>
  );
}
