import React from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { spacing } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}

/** Root container for a screen: applies the themed background and safe padding. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
}: ScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const base: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
    padding: padded ? spacing[4] : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[{ padding: padded ? spacing[4] : 0, gap: spacing[4] }, style]}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[base, { gap: spacing[4] }, style]}>{children}</View>;
}
