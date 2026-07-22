import type { Program } from '@supotsu/core';

/**
 * Marketplace catalogue. Ids are stable slugs shared with the DB seed
 * (supabase/migrations/0004_community_marketplace.sql), so demo mode and the
 * real backend show the same programs.
 */
export const PROGRAM_CATALOG: Program[] = [
  {
    id: 'prog-force-debutant',
    title: 'Force Fondations',
    author: 'Coach Léa',
    focus: 'strength',
    level: 'beginner',
    weeks: 8,
    sessionsPerWeek: 3,
    description: 'Bases du renforcement full-body : squat, charnière de hanche, poussée, tirage.',
    priceCents: 0,
  },
  {
    id: 'prog-endurance-5k',
    title: 'Objectif 5 km',
    author: 'Coach Marco',
    focus: 'endurance',
    level: 'beginner',
    weeks: 6,
    sessionsPerWeek: 3,
    description: 'Progression course à pied du fractionné léger à un 5 km continu.',
    priceCents: 0,
  },
  {
    id: 'prog-hyrox-prep',
    title: 'Prépa Hyrox',
    author: 'Coach Sarah',
    focus: 'hyrox',
    level: 'confirmed',
    weeks: 10,
    sessionsPerWeek: 5,
    description: 'Compromis force-endurance orienté stations Hyrox (wall balls, sled, rameur).',
    priceCents: 2900,
  },
  {
    id: 'prog-recomp',
    title: 'Recomposition 12 semaines',
    author: 'Coach Léa',
    focus: 'weight_loss',
    level: 'intermediate',
    weeks: 12,
    sessionsPerWeek: 4,
    description: 'Musculation + cardio raisonné pour perdre du gras en gardant le muscle.',
    priceCents: 1900,
  },
  {
    id: 'prog-mobilite',
    title: 'Mobilité quotidienne',
    author: 'Coach Yuki',
    focus: 'mobility',
    level: 'beginner',
    weeks: 4,
    sessionsPerWeek: 6,
    description: '10 minutes par jour pour les hanches, les épaules et le dos.',
    priceCents: 0,
  },
];
