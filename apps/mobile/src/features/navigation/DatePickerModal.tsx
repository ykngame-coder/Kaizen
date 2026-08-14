import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ISODateString } from '@supotsu/core';

const DAY_MS = 86_400_000;
const FR_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WEEK_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function endOfDayIso(d: Date): ISODateString {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export interface DatePickerModalProps {
  visible: boolean;
  value: ISODateString;
  onSelect: (value: ISODateString) => void;
  onClose: () => void;
  /** Same planning horizon as DayNav — dates past it are shown but disabled. */
  maxDaysFuture?: number;
}

/**
 * Month-grid date picker (same layout as CalendarScreen's grid), as a modal —
 * lets DayNav jump straight to an arbitrary day instead of stepping one at a
 * time with ‹ ›.
 */
export function DatePickerModal({
  visible,
  value,
  onSelect,
  onClose,
  maxDaysFuture = 7,
}: DatePickerModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const now = useMemo(() => new Date(), [visible]);
  const selectedKey = dayKey(new Date(value));
  const [monthOffset, setMonthOffset] = useState(0);
  const maxKey = dayKey(new Date(now.getTime() + maxDaysFuture * DAY_MS));

  const grid = useMemo(() => {
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d, key: dayKey(new Date(year, month, d)) });
    return { year, month, cells };
  }, [now, monthOffset]);

  const pick = (key: string): void => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    onSelect(endOfDayIso(new Date(y, m - 1, d)));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing[5] }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing[4],
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] }}>
            <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={8}>
              <Text variant="subtitle" color="textSubtle">‹</Text>
            </Pressable>
            <Text variant="heading">{FR_MONTHS[grid.month]} {grid.year}</Text>
            <Pressable onPress={() => setMonthOffset((o) => o + 1)} hitSlop={8}>
              <Text variant="subtitle" color="textSubtle">›</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row' }}>
            {WEEK_HEAD.map((h, i) => (
              <Text key={i} variant="caption" color="textSubtle" style={{ flex: 1, textAlign: 'center' }}>{h}</Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] }}>
            {grid.cells.map((cell, i) => {
              if (!cell) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const isToday = cell.key === dayKey(now);
              const isSelected = cell.key === selectedKey;
              const disabled = cell.key > maxKey;
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => pick(cell.key)}
                  style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      backgroundColor: isSelected ? 'rgba(45,127,249,0.22)' : colors.surfaceElevated,
                      borderWidth: isSelected || isToday ? 1.5 : 0,
                      borderColor: isSelected ? colors.primary : colors.accentData,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: disabled ? 0.3 : 1,
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{
                        color: isToday ? colors.accentData : isSelected ? colors.primary : colors.textMuted,
                        fontWeight: isToday || isSelected ? '800' : '400',
                      }}
                    >
                      {cell.day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
