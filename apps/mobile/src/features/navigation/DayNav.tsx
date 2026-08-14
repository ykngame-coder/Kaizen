import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ISODateString } from '@supotsu/core';
import { DatePickerModal } from './DatePickerModal';

const DAY_MS = 86_400_000;

const dayKey = (iso: ISODateString): string => iso.slice(0, 10);

/**
 * End of the given day, as an ISO timestamp — the `asOf` reference instant
 * used across a hub's mini-accueil. End-of-day (not start-of-day) so that a
 * day's own data — including something measured earlier "today" — is never
 * excluded by an `asOf` that's technically in its past.
 */
function endOfDayIso(d: Date): ISODateString {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function labelFor(value: ISODateString, todayKey: string): string {
  const key = dayKey(value);
  if (key === todayKey) return "Aujourd'hui";
  if (key === dayKey(new Date(Date.now() - DAY_MS).toISOString())) return 'Hier';
  if (key === dayKey(new Date(Date.now() + DAY_MS).toISOString())) return 'Demain';
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export interface DayNavProps {
  value: ISODateString;
  onChange: (value: ISODateString) => void;
  /** How many days into the future navigation is allowed (default 7 — one week of planning horizon). */
  maxDaysFuture?: number;
}

/**
 * Compact "‹ Aujourd'hui ›" day navigator, shared by the 3 hub mini-accueils
 * so a screen can recontextualize on a specific day instead of always
 * "today". Past is unlimited; future is capped at `maxDaysFuture`. When not
 * on today, a small "Aujourd'hui" chip lets you jump straight back.
 */
export function DayNav({ value, onChange, maxDaysFuture = 7 }: DayNavProps): React.JSX.Element {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const isToday = dayKey(value) === todayKey;
  const atMax = dayKey(value) >= dayKey(new Date(now.getTime() + maxDaysFuture * DAY_MS).toISOString());

  const shift = (days: number): void => {
    onChange(endOfDayIso(new Date(new Date(value).getTime() + days * DAY_MS)));
  };

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
        onPress={() => shift(-1)}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing[1] })}
      >
        <Text variant="heading">‹</Text>
      </Pressable>

      <Pressable
        onPress={() => setPickerOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
      >
        <Text variant="subtitle">{labelFor(value, todayKey)}</Text>
        {!isToday ? (
          <Pressable
            onPress={() => onChange(endOfDayIso(now))}
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
        onPress={() => shift(1)}
        disabled={atMax}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: atMax ? 0.25 : pressed ? 0.5 : 1, padding: spacing[1] })}
      >
        <Text variant="heading">›</Text>
      </Pressable>

      <DatePickerModal
        visible={pickerOpen}
        value={value}
        onSelect={onChange}
        onClose={() => setPickerOpen(false)}
        maxDaysFuture={maxDaysFuture}
      />
    </View>
  );
}

/**
 * `selectedDate` state for a hub mini-accueil: starts on "today" (end-of-day
 * instant, see `endOfDayIso`) every time the owning screen mounts — i.e.
 * switching tabs away and back resets to today rather than remembering the
 * last day browsed.
 */
export function useSelectedDay(): [ISODateString, (value: ISODateString) => void] {
  return useState<ISODateString>(() => endOfDayIso(new Date()));
}
