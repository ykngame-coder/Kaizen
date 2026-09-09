import React from 'react';
import { RefreshControl, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  /** Enables pull-to-refresh (scroll screens only). */
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** Root container for a screen: applies the themed background and safe padding. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  onRefresh,
  refreshing = false,
}: ScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // No native header on any stack (headerShown: false everywhere) — Screen is
  // the only place that can keep content clear of the status bar / Dynamic
  // Island, so top padding adds the device inset on top of the normal gap
  // instead of the fixed spacing[4] alone.
  const topPadding = (padded ? spacing[4] : 0) + insets.top;
  const base: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
    padding: padded ? spacing[4] : 0,
    paddingTop: topPadding,
  };

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[{ padding: padded ? spacing[4] : 0, paddingTop: topPadding, gap: spacing[4] }, style]}
        // Sans ça, le clavier recouvrait les champs au lieu de les faire
        // remonter : sur le formulaire de repas, les macros passaient sous le
        // pavé numérique dès qu'on tapait les calories.
        automaticallyAdjustKeyboardInsets
        // « on doit à chaque fois cliquer dans un champ extérieur pour pouvoir
        // écrire un macro » : par défaut, un tap clavier ouvert ne fait que le
        // fermer, et il en faut un second pour atteindre le champ visé.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[base, { gap: spacing[4] }, style]}>{children}</View>;
}
