import React from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';

export interface HubRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  onPress?: () => void;
  /** Not built yet — shows a "Bientôt" badge and is not tappable. */
  soon?: boolean;
}

/** A navigation row for hub screens: icon + title + subtitle, chevron or "Bientôt". */
export function HubRow({ title, subtitle, icon, onPress, soon }: HubRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const body = (
    <Card style={{ opacity: soon ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        {icon ? <Text style={{ fontSize: 20 }}>{icon}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text variant="heading">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {soon ? (
          <Badge label="Bientôt" tone="neutral" />
        ) : (
          <Text variant="subtitle" style={{ color: colors.textSubtle }}>
            ›
          </Text>
        )}
      </View>
    </Card>
  );
  if (soon || !onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}
