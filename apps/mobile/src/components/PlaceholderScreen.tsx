import React from 'react';
import { Card, Screen, Text } from '@supotsu/ui';

/** Shared stub for sections whose logic ships in later steps. */
export function PlaceholderScreen({
  title,
  subtitle,
  comingIn,
}: {
  title: string;
  subtitle: string;
  comingIn: string;
}): React.JSX.Element {
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Text variant="body" color="textMuted">
        {subtitle}
      </Text>
      <Card>
        <Text variant="label" color="textMuted">
          À VENIR
        </Text>
        <Text variant="body">{comingIn}</Text>
      </Card>
    </Screen>
  );
}
