import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { SPORT_CARD_DEFS } from '@/features/sport/sportCards';

export default function SportCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('sport.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={SPORT_CARD_DEFS}
      prefKey="sportCards"
      backLabel={t('common.back')}
    />
  );
}
