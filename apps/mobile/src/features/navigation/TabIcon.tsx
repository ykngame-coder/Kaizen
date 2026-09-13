import React from 'react';
import { Icon, type IconName } from '@supotsu/ui';

/** Vector icon per hub tab (Accueil, Sport, Sommeil, Nutrition, Profil) — all
 * five routed through the shared `Icon` registry so the tab bar renders one
 * consistent icon family instead of mixing in a text glyph for Profil. */
const ROUTE_ICON: Record<string, IconName> = {
  sport: 'dumbbell',
  sommeil: 'bedtime',
  nutrition: 'apple',
  profile: 'menu',
  index: 'dashboard',
};

export function TabIcon({
  route,
  color,
  size,
}: {
  route: string;
  color: string;
  size: number;
}): React.JSX.Element {
  return <Icon name={ROUTE_ICON[route] ?? 'search'} size={size} color={color} />;
}
