import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '@supotsu/design-system';
import { Text } from './Text';

export interface FabProps {
  /** Glyph shown in the button (e.g. "+"). */
  icon?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Distance from the bottom — leave room for the tab bar (default 96). */
  bottom?: number;
  right?: number;
  size?: number;
}

/**
 * Floating action button — a brand-gradient circle pinned bottom-right, above
 * the tab bar. Used by Nutrition (+ aliments/eau), Entraînements, etc.
 */
export function Fab({
  icon = '+',
  onPress,
  accessibilityLabel = 'Ajouter',
  bottom = 96,
  right = 20,
  size = 60,
}: FabProps): React.JSX.Element {
  const wrap: ViewStyle = { position: 'absolute', bottom, right, zIndex: 50 };
  return (
    <View style={wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}
      >
        <LinearGradient
          colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#2d7ff9',
            shadowOpacity: 0.5,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: size * 0.44, lineHeight: size * 0.5, marginTop: -2 }}>{icon}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
