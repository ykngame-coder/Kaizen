import type { Pillar } from '@supotsu/core';

/** The seven product pillars, ordered as in the Master Prompt (P1). */
export const PILLARS: readonly Pillar[] = [
  'sleep',
  'recovery',
  'performance',
  'nutrition',
  'habits',
  'understanding',
  'decision',
] as const;

/** Bottom navigation sections (Master Prompt P7.2, P17.12, P28.12). */
export const NAV_SECTIONS = [
  { key: 'home', labelFr: 'Accueil' },
  { key: 'training', labelFr: 'Entraînement' },
  { key: 'activities', labelFr: 'Activités' },
  { key: 'coach', labelFr: 'Coach IA' },
  { key: 'profile', labelFr: 'Profil' },
] as const;

export type NavSectionKey = (typeof NAV_SECTIONS)[number]['key'];

/** Recovery Score interpretation bands (Master Prompt P13.4). */
export const RECOVERY_BANDS = [
  { min: 85, max: 100, labelFr: 'Excellent' },
  { min: 60, max: 84, labelFr: 'Correct' },
  { min: 40, max: 59, labelFr: 'Moyen' },
  { min: 0, max: 39, labelFr: 'Faible' },
] as const;
