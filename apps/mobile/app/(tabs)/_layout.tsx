import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@supotsu/ui';

const ICONS: Record<string, string> = {
  index: '◎',
  training: '⚡',
  activities: '≋',
  coach: '✦',
  profile: '☰',
};

/** Bottom tab navigation — the five main sections (Master Prompt P7.2, P28.12). */
export default function TabsLayout(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18 }}>{ICONS[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="training" options={{ title: 'Entraînement' }} />
      <Tabs.Screen name="activities" options={{ title: 'Activités' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach IA' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
