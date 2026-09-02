import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { SOMMEIL_CARD_DEFS } from '@/features/sommeil/sommeilCards';

export default function SommeilCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('sommeil.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={SOMMEIL_CARD_DEFS}
      prefKey="sommeilCards"
      backLabel={t('common.back')}
    />
  );
}
