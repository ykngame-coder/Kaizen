import React from 'react';
import { View } from 'react-native';
import { spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { Button } from './Button';

export interface EmptyStateProps {
  /** A single emoji or short glyph shown above the text. */
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Friendly placeholder for empty lists — a glyph, a title, a hint and a CTA. */
export function EmptyState({
  icon = '✨',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] }}>
      <Text variant="display">{icon}</Text>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="textMuted" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing[1] }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
