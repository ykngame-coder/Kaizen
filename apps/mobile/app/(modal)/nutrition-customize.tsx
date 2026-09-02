import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { NUTRITION_CARD_DEFS } from '@/features/nutrition/nutritionCards';

export default function NutritionCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('nutrition.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={NUTRITION_CARD_DEFS}
      prefKey="nutritionCards"
      backLabel={t('common.back')}
    />
  );
}
