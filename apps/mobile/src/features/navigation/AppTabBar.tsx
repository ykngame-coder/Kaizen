import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@supotsu/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';

interface TabDef {
  key: string;
  label: string;
  icon: string;
  path: Href;
}

/** The five main sections — mirrors the (tabs) group, always reachable. */
const TABS: TabDef[] = [
  { key: 'index', label: 'Accueil', icon: '◎', path: '/' },
  { key: 'training', label: 'Entraînement', icon: '⚡', path: '/training' },
  { key: 'activities', label: 'Activités', icon: '≋', path: '/activities' },
  { key: 'nutrition', label: 'Nutrition', icon: '◍', path: '/nutrition' },
  { key: 'coach', label: 'Coach', icon: '✦', path: '/coach' },
  { key: 'profile', label: 'Profil', icon: '☰', path: '/profile' },
];

/**
 * Persistent bottom navigation, rendered once at the app root so it stays
 * visible on every screen — including detail pages pushed over the tabs
 * (Sommeil, Muscles, Sons…). The native Tabs bar is hidden to avoid a
 * duplicate. Emerald marks the active section; a lime dot underlines it.
 */
export function AppTabBar(): React.JSX.Element | null {
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status: authStatus } = useAuth();
  const { status: onboardingStatus } = useOnboarding();

  // Only show inside the authenticated, onboarded app.
  if (authStatus !== 'authenticated' || onboardingStatus !== 'done') return null;
  const group = segments[0];
  if (group === '(auth)' || group === '(onboarding)') return null;

  // Active section: a (tabs) screen highlights its tab; detail pages highlight none.
  const activeKey = group === '(tabs)' ? (segments[1] ?? 'index') : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {TABS.map((tab) => {
        const active = tab.key === activeKey;
        const tint = active ? colors.primary : colors.textSubtle;
        return (
          <Pressable
            key={tab.key}
            onPress={() => router.navigate(tab.path)}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}
          >
            <Text style={{ color: tint, fontSize: 18 }}>{tab.icon}</Text>
            <Text style={{ color: tint, fontSize: 10, fontWeight: active ? '700' : '500' }}>
              {tab.label}
            </Text>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                marginTop: 1,
                backgroundColor: active ? colors.accentLime : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
