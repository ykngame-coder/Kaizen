import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useTheme } from '@supotsu/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { LandingScreen } from '@/features/marketing/LandingScreen';

/** Splash while the route guard resolves session + onboarding state — on web, a signed-out visitor sees the marketing landing page instead (RouteGuard exempts root from the sign-in redirect in that case). */
export default function Index(): React.JSX.Element {
  const { colors } = useTheme();
  const { status } = useAuth();

  if (Platform.OS === 'web' && status === 'unauthenticated') {
    return <LandingScreen />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
