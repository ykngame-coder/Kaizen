import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Text } from '@supotsu/ui';
import type { FoodItem } from '@supotsu/core';
import { FoodPickerSheet } from './FoodPickerSheet';
import { FoodLogCard } from './FoodLogCard';

/** Search foods on Open Food Facts and log a portion (Master Prompt P11). */
export function FoodSearchScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const [selected, setSelected] = useState<FoodItem | null>(null);

  return (
    <Screen scroll>
      <Text variant="title">{t('nutrition.foodSearch.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('nutrition.foodSearch.subtitle')}
      </Text>

      <FoodPickerSheet
        visible
        selected={selected}
        onSearchStart={() => setSelected(null)}
        onPick={setSelected}
      />

      {selected ? <FoodLogCard key={selected.barcode ?? selected.name} food={selected} onLogged={() => router.back()} /> : null}

      <Button label={t('nutrition.foodSearch.backButton')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
