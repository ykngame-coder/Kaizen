import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import type { HubCardDef } from '@/lib/hubCards';
import { QUICK_LINKS } from '@/features/dashboard/DashboardScreen';

export default function QuickLinksCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  const cardDefs: HubCardDef[] = useMemo(() => QUICK_LINKS.map((l) => ({ id: l.key, label: t(l.labelKey) })), [t]);
  return (
    <HubCustomizeScreen
      title={t('dashboard.screen.quickLinks.customizeTitle')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={cardDefs}
      prefKey="quickLinks"
      backLabel={t('common.back')}
    />
  );
}
