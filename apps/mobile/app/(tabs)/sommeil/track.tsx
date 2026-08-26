import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

/**
 * Phone-based overnight sleep tracking (features/sommeil/SleepTrackingScreen,
 * nightTracker.ts) is paused — iOS/Android throttle the accelerometer once
 * the app leaves the foreground, so tracking silently stopped overnight.
 * Code stays in the repo untouched, this route just stops surfacing it.
 */
export default function Track(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('sommeil.trackPlaceholder.title')}
      subtitle={t('sommeil.trackPlaceholder.subtitle')}
      comingIn={t('sommeil.trackPlaceholder.comingIn')}
    />
  );
}
