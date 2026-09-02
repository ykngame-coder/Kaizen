import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { DASHBOARD_CARD_DEFS } from '@/features/dashboard/dashboardCards';

export default function DashboardCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('dashboard.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={DASHBOARD_CARD_DEFS}
      prefKey="dashboardCards"
      backLabel={t('common.back')}
    />
  );
}
