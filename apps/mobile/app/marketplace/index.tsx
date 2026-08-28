import React from 'react';
import { MarketplaceScreen } from '@/features/marketplace/MarketplaceScreen';

/**
 * Only the "Catalogue" (coach-authored) tab is paused, internally to
 * MarketplaceScreen — Communauté and Mes créations (create/share a session
 * or program) stay live. See MarketplaceScreen.tsx for the tab-level pause.
 */
export default function Marketplace(): React.JSX.Element {
  return <MarketplaceScreen />;
}
