import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@supotsu/ui';
import { TabIcon } from '@/features/navigation/TabIcon';

/** Bottom tab navigation — the five main sections (Master Prompt P7.2, P28.12). */
export default function TabsLayout(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Tabs
      // The bottom bar is rendered once at the app root (AppTabBar) so it stays
      // visible on detail screens too; hide the native one to avoid a duplicate.
      tabBar={() => null}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color }) =>
          route.name === 'profile' ? (
            <Text style={{ color, fontSize: 18 }}>☰</Text>
          ) : (
            <TabIcon route={route.name} color={color} size={18} />
          ),
      })}
    >
      {/* The 5 hubs shown in the persistent AppTabBar */}
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="sport" options={{ title: 'Sport' }} />
      <Tabs.Screen name="sommeil" options={{ title: 'Sommeil' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
      {/* Still routable (linked from hubs/Accueil), not shown in the bar */}
      <Tabs.Screen name="coach" options={{ title: 'Coach IA' }} />
    </Tabs>
  );
}
