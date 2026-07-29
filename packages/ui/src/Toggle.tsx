import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '@supotsu/design-system';
import { useTheme } from './theme';

export interface ToggleProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
}

const W = 50;
const H = 30;
const KNOB = 24;
const PAD = 3;

/**
 * Premium switch — the "on" track fills with the brand blue→purple gradient and
 * the knob slides with a spring. Matches the iOS-style toggles in the mockups.
 */
export function Toggle({ value, onValueChange, disabled = false }: ToggleProps): React.JSX.Element {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, friction: 9, tension: 90 }).start();
  }, [value, anim]);

  const knobX = anim.interpolate({ inputRange: [0, 1], outputRange: [PAD, W - KNOB - PAD] });
  const onOpacity = anim; // 0 → off track, 1 → gradient track

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={disabled ? undefined : () => onValueChange?.(!value)}
      style={{ opacity: disabled ? 0.4 : 1 }}
      hitSlop={8}
    >
      <View style={{ width: W, height: H, borderRadius: H / 2, backgroundColor: colors.surfaceElevated, justifyContent: 'center' }}>
        <Animated.View style={{ ...StyleFill, borderRadius: H / 2, opacity: onOpacity }}>
          <LinearGradient
            colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1, borderRadius: H / 2 }}
          />
        </Animated.View>
        <Animated.View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: '#ffffff',
            transform: [{ translateX: knobX }],
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </View>
    </Pressable>
  );
}

const StyleFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
