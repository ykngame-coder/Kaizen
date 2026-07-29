import React from 'react';
import { Pressable, View } from 'react-native';
import { radii, spacing } from '@supotsu/design-system';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ListRowProps {
  /** Emoji/glyph inside the coloured icon square. Omit for no icon. */
  icon?: string;
  /** Tint of the icon square background (defaults to elevated surface). */
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Right-side value text (shown before the chevron). */
  value?: string;
  /** Custom right accessory (Toggle, Badge…). Overrides `value`/chevron. */
  accessory?: React.ReactNode;
  /** Show the ">" chevron. Auto-on when `onPress` is set and no accessory. */
  chevron?: boolean;
  onPress?: () => void;
  /** Render the title/value in the destructive (error) colour. */
  destructive?: boolean;
  /** Draw a hairline separator below (for grouped lists). */
  divider?: boolean;
}

/**
 * A single grouped-list row (iOS Settings style): coloured icon square, title +
 * optional subtitle, and a right accessory — value text, chevron, or a custom
 * control. The workhorse of the settings/profile/devices screens.
 */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  accessory,
  chevron,
  onPress,
  destructive = false,
  divider = false,
}: ListRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const showChevron = chevron ?? (!!onPress && !accessory && value == null);

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        paddingVertical: spacing[3],
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      {icon != null ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radii.md,
            backgroundColor: iconColor ?? colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 17 }}>{icon}</Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text variant="body" color={destructive ? 'error' : 'text'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {accessory ??
        (value != null ? (
          <Text variant="body" color="textMuted">
            {value}
          </Text>
        ) : null)}
      {showChevron ? (
        <Text variant="body" color="textSubtle" style={{ marginLeft: spacing[1] }}>
          ›
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}
