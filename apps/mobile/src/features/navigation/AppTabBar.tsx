import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@supotsu/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { TabIcon } from './TabIcon';

interface TabDef {
  key: string;
  path: Href;
}

/** The five hubs (architecture: APP → Application). Always reachable. */
const TABS: TabDef[] = [
  { key: 'index', path: '/' },
  { key: 'sport', path: '/sport' },
  { key: 'sommeil', path: '/sommeil' },
  { key: 'nutrition', path: '/nutrition' },
  { key: 'profile', path: '/profile' },
];

/**
 * Persistent bottom navigation, rendered once at the app root so it stays
 * visible on every screen — including detail pages pushed over the tabs
 * (Sommeil, Muscles, Sons…). The native Tabs bar is hidden to avoid a
 * duplicate. Emerald marks the active section; a lime dot underlines it.
 */
export function AppTabBar(): React.JSX.Element | null {
  const { t } = useTranslation();
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
            {tab.key === 'profile' ? (
              <Text style={{ color: tint, fontSize: 18 }}>☰</Text>
            ) : (
              <TabIcon route={tab.key} color={tint} size={20} />
            )}
            <Text style={{ color: tint, fontSize: 10, fontWeight: active ? '700' : '500' }}>
              {t(`common.tab.${tab.key}`)}
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
