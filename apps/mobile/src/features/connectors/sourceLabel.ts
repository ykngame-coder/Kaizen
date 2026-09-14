import type { TFunction } from 'i18next';
import type { DataSource } from '@supotsu/core';

/**
 * Nom et icône lisibles d'une source de données. Sans lui, un écran affichait
 * l'identifiant technique — « 13 sept. · apple_health » sur la fiche d'une
 * activité importée.
 */
export function sourceLabel(t: TFunction): Partial<Record<DataSource, { name: string; icon: string }>> {
  return {
    garmin: { name: 'Garmin', icon: '⌚' },
    apple_health: { name: 'Apple Santé', icon: '🍎' },
    strava: { name: 'Strava', icon: '🏃' },
    renpho: { name: 'Renpho', icon: '⚖' },
    withings: { name: 'Withings', icon: '⚖' },
    polar: { name: 'Polar', icon: '❤️' },
    coros: { name: 'Coros', icon: '⌚' },
    oura: { name: 'Oura', icon: '💍' },
    fitbit: { name: 'Fitbit', icon: '⌚' },
    supotsu: { name: 'Supotsu', icon: '✨' },
    manual: { name: t('connectors.devices.sourceLabel.manual'), icon: '✍️' },
  };
}

/** Le nom seul, avec l'identifiant en dernier recours pour une source inconnue. */
export const sourceName = (source: string, t: TFunction): string => sourceLabel(t)[source as DataSource]?.name ?? source;
