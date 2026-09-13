import React from 'react';
import { View } from 'react-native';
import { spacing } from '@supotsu/design-system';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export type Trend = 'up' | 'down' | 'flat';

export interface KPICardProps {
  label: string;
  /** Displayed value, e.g. "82" or "82/100". */
  value: string;
  unit?: string;
  trend?: Trend;
  /** Short caption, e.g. "en progression depuis 14 jours". */
  caption?: string;
}

const TREND_ICON: Record<Trend, IconName> = { up: 'trendingUp', down: 'trendingDown', flat: 'trendingFlat' };

/** Score / stat tile for the dashboard (Master Prompt P28.8 KPI Card). */
export function KPICard({ label, value, unit, trend, caption }: KPICardProps): React.JSX.Element {
  const { colors } = useTheme();
  const trendColor =
    trend === 'up' ? colors.success : trend === 'down' ? colors.error : colors.textMuted;

  return (
    <Card>
      <Text variant="label" color="textMuted">
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] }}>
        <Text variant="data">{value}</Text>
        {unit ? (
          <Text variant="subtitle" color="textMuted" style={{ marginBottom: spacing[1] }}>
            {unit}
          </Text>
        ) : null}
        {trend ? (
          <View style={{ marginBottom: spacing[1] }}>
            <Icon name={TREND_ICON[trend]} size={16} color={trendColor} />
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}
