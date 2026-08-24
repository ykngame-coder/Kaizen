import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

/**
 * The program catalog (features/marketplace/*) is paused pre-launch — its
 * code stays in the repo untouched, this route just stops surfacing it.
 */
export default function Marketplace(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('marketplace.placeholder.title')}
      subtitle={t('marketplace.placeholder.subtitle')}
      comingIn={t('marketplace.placeholder.comingIn')}
    />
  );
}
