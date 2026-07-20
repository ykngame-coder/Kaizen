import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@supotsu/ui';

/** Splash while the route guard resolves session + onboarding state. */
export default function Index(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
