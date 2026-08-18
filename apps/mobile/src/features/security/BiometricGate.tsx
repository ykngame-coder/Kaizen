import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button, Icon, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { usePreferences } from '@/lib/preferences';

/**
 * Gates app content behind Face ID/Touch ID when "Verrouillage biométrique"
 * is on — re-locks whenever the app is backgrounded. No-op on web and when
 * the preference is off.
 */
export function BiometricGate({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const { preferences, ready } = usePreferences();
  const { colors } = useTheme();
  const enabled = preferences.biometricLock && Platform.OS !== 'web';
  const [unlocked, setUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const authenticate = async (): Promise<void> => {
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Déverrouille Kaizen Supotsu',
        cancelLabel: 'Annuler',
      });
      if (result.success) setUnlocked(true);
    } finally {
      setAuthenticating(false);
    }
  };

  // Lock immediately whenever the preference turns on (including at launch).
  useEffect(() => {
    if (!ready || !enabled) return;
    setUnlocked(false);
    void authenticate();
  }, [ready, enabled]);

  // Re-lock on backgrounding so leaving the app always requires another check.
  useEffect(() => {
    if (!ready || !enabled) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setUnlocked(false);
    });
    return () => sub.remove();
  }, [ready, enabled]);

  // Preferences haven't loaded yet — wait rather than risk a flash of
  // unlocked content before we know whether the lock should apply.
  if (!ready) return null;
  if (!enabled || unlocked) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing[4], padding: spacing[6] }}>
      <Icon name="shieldLock" size={44} color={colors.primary} />
      <Text variant="body" color="textMuted" style={{ textAlign: 'center' }}>
        Kaizen Supotsu est verrouillé. Déverrouille avec Face ID / Touch ID pour continuer.
      </Text>
      {authenticating ? <ActivityIndicator color={colors.primary} /> : <Button label="Déverrouiller" onPress={() => void authenticate()} />}
    </View>
  );
}
