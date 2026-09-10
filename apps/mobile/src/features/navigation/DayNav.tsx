import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { DatePickerModal } from './DatePickerModal';
import { dayKeyOf, selectedDayFrom, selectedDayToday, shiftDay, type SelectedDay } from './day';

const DAY_MS = 86_400_000;

function labelFor(day: SelectedDay): string {
  if (day.isToday) return "Aujourd'hui";
  if (day.key === dayKeyOf(new Date(Date.now() - DAY_MS))) return 'Hier';
  if (day.key === dayKeyOf(new Date(Date.now() + DAY_MS))) return 'Demain';
  return new Date(day.noon).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export interface DayNavProps {
  value: SelectedDay;
  onChange: (value: SelectedDay) => void;
  /** How many days into the future navigation is allowed (default 7 — one week of planning horizon). */
  maxDaysFuture?: number;
}

/**
 * Compact "‹ Aujourd'hui ›" day navigator, shared by the hub mini-accueils so a
 * screen can recontextualize on a specific day instead of always "today". Past
 * is unlimited; future is capped at `maxDaysFuture`.
 *
 * Carries a `SelectedDay`, not an ISO instant. It used to hand each hub
 * 23:59:59.999 local and let it work out which day that was — which is where
 * five day-boundary bugs came from. Its own `dayKey` was `iso.slice(0, 10)`,
 * the UTC date, so on a negative-offset timezone every label was a day off.
 */
export function DayNav({ value, onChange, maxDaysFuture = 7 }: DayNavProps): React.JSX.Element {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const atMax = value.key >= dayKeyOf(new Date(Date.now() + maxDaysFuture * DAY_MS));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[3],
        marginTop: spacing[1],
      }}
    >
      <Pressable
        onPress={() => onChange(shiftDay(value, -1))}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing[1] })}
      >
        <Text variant="heading">‹</Text>
      </Pressable>

      <Pressable
        onPress={() => setPickerOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
      >
        <Text variant="subtitle">{labelFor(value)}</Text>
        {!value.isToday ? (
          <Pressable
            onPress={() => onChange(selectedDayToday())}
            hitSlop={6}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.full,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text variant="caption" color="primary">
              Aujourd'hui
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => onChange(shiftDay(value, 1))}
        disabled={atMax}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: atMax ? 0.25 : pressed ? 0.5 : 1, padding: spacing[1] })}
      >
        <Text variant="heading">›</Text>
      </Pressable>

      {/* DatePickerModal reste sur un instant ISO : c'est un sélecteur de date
          générique, aussi utilisé par Objectifs, Nouveau repas et Planning. La
          conversion se fait ici, une fois. */}
      <DatePickerModal
        visible={pickerOpen}
        value={value.noon}
        onSelect={(iso) => onChange(selectedDayFrom(dayKeyOf(iso)))}
        onClose={() => setPickerOpen(false)}
        maxDaysFuture={maxDaysFuture}
      />
    </View>
  );
}

export { useSelectedDay } from './day';
