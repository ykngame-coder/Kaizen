import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, useTheme } from '@supotsu/ui';

/**
 * Small circular back button for pushed (non-tab-root) screens. Every stack
 * in this app has `headerShown: false` (screens draw their own custom top),
 * so without this a pushed screen has no visible way back — only the native
 * iOS edge-swipe gesture, which testers repeatedly missed.
 */
export function BackButton(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      accessibilityLabel="Retour"
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="heading">‹</Text>
    </Pressable>
  );
}
