import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

/**
 * The smart alarm (features/sommeil/AlarmSettingsScreen) only ever rings
 * reliably while the phone-tracking night mode is open in the foreground —
 * paused for the same reason as /sommeil/track. Code stays in the repo
 * untouched, this route just stops surfacing it.
 */
export default function Alarm(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('sommeil.alarmPlaceholder.title')}
      subtitle={t('sommeil.alarmPlaceholder.subtitle')}
      comingIn={t('sommeil.alarmPlaceholder.comingIn')}
    />
  );
}
