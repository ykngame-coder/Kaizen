import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@supotsu/ui';

/**
 * Back link for pushed (non-tab-root) screens, matching the "‹ Retour" style
 * already used in CalendarScreen — a labelled text link reads more clearly
 * as "go back" than a bare chevron-only circle. Every stack in this app has
 * `headerShown: false` (screens draw their own custom top), so without this
 * a pushed screen has no visible way back — only the native iOS edge-swipe
 * gesture, which testers repeatedly missed.
 */
export function BackButton(): React.JSX.Element {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Retour" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}>
      <Text variant="caption" color="primary">‹ Retour</Text>
    </Pressable>
  );
}
