import '../global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@supotsu/ui';
import { queryClient } from '@/lib/query';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { PreferencesProvider } from '@/lib/preferences';
import { AppTabBar } from '@/features/navigation/AppTabBar';
import { BiometricGate } from '@/features/security/BiometricGate';

/**
 * Central route gate: sends users to auth, onboarding or the app depending on
 * session + onboarding status (Master Prompt P7.4 onboarding, P17.2).
 */
function RouteGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status: authStatus } = useAuth();
  const { status: onboardingStatus } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  const authResolving = authStatus === 'loading';
  const onboardingResolving = authStatus === 'authenticated' && onboardingStatus === 'loading';
  const resolving = authResolving || onboardingResolving;

  useEffect(() => {
    if (resolving) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';
    // Terms/Privacy Policy must stay reachable while signed out — they're
    // also the app's public web URLs (App Store Connect requires a working
    // Privacy Policy URL, reachable without an account).
    const inLegal = group === '(legal)';
    // Root ('/') on web is the marketing landing page for signed-out
    // visitors (kaizensupotsu.uk) — the native app has no use for it and
    // keeps going straight to sign-in.
    const atWebRoot = Platform.OS === 'web' && group === undefined;

    if (authStatus === 'unauthenticated') {
      if (!inAuth && !inLegal && !atWebRoot) router.replace('/(auth)/sign-in');
      return;
    }
    // authenticated
    if (onboardingStatus === 'needed' && !inOnboarding) {
      router.replace('/(onboarding)');
    } else if (onboardingStatus === 'done' && (inAuth || inOnboarding || group === undefined)) {
      router.replace('/(tabs)');
    }
  }, [resolving, authStatus, onboardingStatus, segments, router]);

  if (resolving) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

/** App root: theming, data client, auth/onboarding state and route gating. */
export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider initialPreference="dark">
          <PreferencesProvider>
            <AuthProvider>
              <OnboardingProvider>
                <StatusBar style="auto" />
                <RouteGuard>
                  <BiometricGate>
                    <View style={{ flex: 1 }}>
                      <View style={{ flex: 1 }}>
                        <Slot />
                      </View>
                      <AppTabBar />
                    </View>
                  </BiometricGate>
                </RouteGuard>
              </OnboardingProvider>
            </AuthProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
