import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';

export interface TimeWheelSheetProps {
  visible: boolean;
  title: string;
  /** « HH:MM ». */
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

const MINUTE_STEP = 5;
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Choix d'une heure à la roue native d'iOS — la même que la feuille de copie
 * des repas. Les minutes vont de 5 en 5 : régler un rappel à 20 h 32 n'a pas
 * de sens, et une roue de 60 crans se manipule mal.
 */
export function TimeWheelSheet({ visible, title, value, onClose, onConfirm }: TimeWheelSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState('20');
  const [minute, setMinute] = useState('30');

  useEffect(() => {
    if (!visible) return;
    const [h, m] = value.split(':');
    setHour(pad(Number(h ?? 20)));
    // Une valeur héritée hors des crans est arrondie au cran le plus proche.
    setMinute(pad(Math.round(Number(m ?? 0) / MINUTE_STEP) * MINUTE_STEP % 60));
  }, [visible, value]);

  const itemStyle = { color: colors.text, fontSize: 21, height: 180 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: spacing[4],
            paddingTop: spacing[3],
            paddingBottom: spacing[4] + insets.bottom,
            gap: spacing[3],
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[3] }}>
            <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text variant="body" color="primary">{t('common.cancel')}</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', height: 180 }}>
            <Picker style={{ flex: 1 }} itemStyle={itemStyle} selectedValue={hour} onValueChange={(v) => setHour(String(v))} accessibilityLabel={t('notifications.reminders.hours')}>
              {Array.from({ length: 24 }, (_, h) => (
                <Picker.Item key={h} value={pad(h)} label={pad(h)} />
              ))}
            </Picker>
            <Picker style={{ flex: 1 }} itemStyle={itemStyle} selectedValue={minute} onValueChange={(v) => setMinute(String(v))} accessibilityLabel={t('notifications.reminders.minutes')}>
              {Array.from({ length: 60 / MINUTE_STEP }, (_, i) => (
                <Picker.Item key={i} value={pad(i * MINUTE_STEP)} label={pad(i * MINUTE_STEP)} />
              ))}
            </Picker>
          </View>

          <Pressable onPress={() => onConfirm(`${hour}:${minute}`)}>
            {({ pressed }) => (
              <View style={{ height: 52, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }}>
                <Text variant="subtitle" style={{ fontWeight: '700', color: colors.onGradient }}>{t('common.save')}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
