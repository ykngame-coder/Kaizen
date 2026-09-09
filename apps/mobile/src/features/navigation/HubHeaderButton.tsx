import React from 'react';
import { Pressable, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';

/**
 * The round action button in a hub's top-right corner.
 *
 * The same 38 px circle was written out by hand in each of the four hubs, which
 * is how the calendar ended up living on Nutrition alone — "le calendrier
 * devrait être présent sur tous les hubs". One component now, so the next
 * action lands everywhere or nowhere on purpose.
 */
export function HubHeaderButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }], opacity: pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {typeof icon === 'string' ? <Text style={{ fontSize: 16 }}>{icon}</Text> : icon}
      </View>
    </Pressable>
  );
}
