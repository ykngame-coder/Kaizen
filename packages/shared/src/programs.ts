import type { Program, ProgramSessionTemplate } from '@supotsu/core';

/**
 * Repeats a fixed pattern of session templates every week for N weeks,
 * cycling through the pattern (modulo) to fill `sessionsPerWeek` slots each
 * week — so a 3-template pattern can still drive a 6-session week (each
 * template used twice) without hand-authoring near-identical entries.
 */
function repeatWeekly(pattern: ProgramSessionTemplate[], weeks: number, sessionsPerWeek: number): ProgramSessionTemplate[] {
  const out: ProgramSessionTemplate[] = [];
  for (let w = 0; w < weeks; w += 1) {
    for (let s = 0; s < sessionsPerWeek; s += 1) out.push(pattern[s % pattern.length]!);
  }
  return out;
}

/** Repeats each week's own template `sessionsPerWeek` times within that week — e.g. a running plan with one distinct session per week, done 3x that week. */
function repeatWithinWeek(weekTemplates: ProgramSessionTemplate[], sessionsPerWeek: number): ProgramSessionTemplate[] {
  return weekTemplates.flatMap((t) => Array.from({ length: sessionsPerWeek }, () => t));
}

const FORCE_FONDATIONS_PATTERN: ProgramSessionTemplate[] = [
  {
    title: 'Squat & Poussée',
    exercises: [
      { exerciseId: 'ex-back-squat', sets: 4, reps: 8 },
      { exerciseId: 'ex-push-up', sets: 3, reps: 12 },
      { exerciseId: 'ex-plank', sets: 3, reps: 30 },
    ],
  },
  {
    title: 'Charnière de hanche & Tirage',
    exercises: [
      { exerciseId: 'ex-romanian-deadlift', sets: 4, reps: 8 },
      { exerciseId: 'ex-lat-pulldown', sets: 3, reps: 10 },
      { exerciseId: 'ex-face-pull', sets: 3, reps: 15 },
    ],
  },
  {
    title: 'Full Body',
    exercises: [
      { exerciseId: 'ex-goblet-squat', sets: 3, reps: 10 },
      { exerciseId: 'ex-overhead-press', sets: 3, reps: 8 },
      { exerciseId: 'ex-seated-cable-row', sets: 3, reps: 10 },
      { exerciseId: 'ex-plank', sets: 3, reps: 30 },
    ],
  },
];

const FIVE_K_WEEKS: ProgramSessionTemplate[] = [
  { title: 'Fractionné léger', notes: '10 min échauffement marche, puis 8 x (1 min course / 2 min marche), 5 min retour au calme.' },
  { title: 'Fractionné', notes: '8 min échauffement, puis 8 x (1,5 min course / 1,5 min marche), 5 min retour au calme.' },
  { title: 'Fractionné soutenu', notes: '8 min échauffement, puis 8 x (2 min course / 1 min marche), 5 min retour au calme.' },
  { title: 'Fractionné long', notes: '5 min échauffement, puis 6 x (3 min course / 1 min marche), 5 min retour au calme.' },
  { title: 'Course longue', notes: '5 min échauffement marche, puis 3 x (8 min course / 2 min marche), 5 min retour au calme.' },
  { title: '5 km continu', notes: 'Cours 5 km sans interruption, à ton rythme. Objectif : finir, pas la vitesse.' },
];

const MOBILITE_PATTERN: ProgramSessionTemplate[] = [
  {
    title: 'Mobilité — Hanches',
    exercises: [
      { exerciseId: 'Hip_Circles_prone', sets: 2, reps: 10 },
      { exerciseId: 'Groin_and_Back_Stretch', sets: 2, reps: 1 },
      { exerciseId: 'Lying_Glute', sets: 2, reps: 1 },
      { exerciseId: '90_90_Hamstring', sets: 2, reps: 10 },
    ],
  },
  {
    title: 'Mobilité — Épaules',
    exercises: [
      { exerciseId: 'Shoulder_Circles', sets: 2, reps: 10 },
      { exerciseId: 'Arm_Circles', sets: 2, reps: 10 },
      { exerciseId: 'Shoulder_Stretch', sets: 2, reps: 1 },
      { exerciseId: 'Round_The_World_Shoulder_Stretch', sets: 2, reps: 8 },
    ],
  },
  {
    title: 'Mobilité — Dos',
    exercises: [
      { exerciseId: 'Cat_Stretch', sets: 2, reps: 10 },
      { exerciseId: 'Childs_Pose', sets: 2, reps: 1 },
      { exerciseId: 'Dynamic_Back_Stretch', sets: 2, reps: 10 },
      { exerciseId: 'Hug_Knees_To_Chest', sets: 2, reps: 1 },
    ],
  },
];

const HYROX_PATTERN: ProgramSessionTemplate[] = [
  {
    title: 'Force stations',
    exercises: [
      { exerciseId: 'ex-back-squat', sets: 5, reps: 5 },
      { exerciseId: 'ex-farmers-carry', sets: 4, reps: 1 },
      { exerciseId: 'ex-kb-swing', sets: 4, reps: 15 },
      { exerciseId: 'ex-wall-balls', sets: 4, reps: 15 },
    ],
  },
  {
    title: 'Engine & sled',
    notes: '4 x (400 m rameur ou course + 20 m poussée/traction traîneau), récupération 2 min entre les tours.',
    exercises: [{ exerciseId: 'ex-burpee', sets: 4, reps: 10 }],
  },
  {
    title: 'Hyrox simulation',
    notes: 'Enchaîne 1 km course + un bloc de stations (wall balls, kettlebell swings, burpees) x4, sur le modèle d’une course Hyrox.',
    exercises: [
      { exerciseId: 'ex-wall-balls', sets: 4, reps: 20 },
      { exerciseId: 'ex-kb-swing', sets: 4, reps: 20 },
      { exerciseId: 'ex-burpee', sets: 4, reps: 15 },
    ],
  },
  {
    title: 'Full body force',
    exercises: [
      { exerciseId: 'ex-deadlift', sets: 5, reps: 5 },
      { exerciseId: 'ex-thruster', sets: 4, reps: 10 },
      { exerciseId: 'ex-mountain-climber', sets: 4, reps: 20 },
    ],
  },
  {
    title: 'Cardio engine',
    notes: '30 min à allure soutenue (course, rameur ou vélo), en variant l’intensité toutes les 5 min.',
  },
];

const RECOMP_PATTERN: ProgramSessionTemplate[] = [
  {
    title: 'Haut du corps',
    exercises: [
      { exerciseId: 'ex-bench-press', sets: 4, reps: 10 },
      { exerciseId: 'ex-lat-pulldown', sets: 4, reps: 10 },
      { exerciseId: 'ex-overhead-press', sets: 3, reps: 10 },
      { exerciseId: 'ex-dumbbell-curl', sets: 3, reps: 12 },
    ],
  },
  {
    title: 'Bas du corps',
    exercises: [
      { exerciseId: 'ex-back-squat', sets: 4, reps: 10 },
      { exerciseId: 'ex-romanian-deadlift', sets: 4, reps: 10 },
      { exerciseId: 'ex-leg-press', sets: 3, reps: 12 },
      { exerciseId: 'ex-standing-calf-raise', sets: 3, reps: 15 },
    ],
  },
  {
    title: 'Cardio raisonné',
    notes: '25-30 min à intensité modérée (marche rapide, vélo ou rameur) — l’objectif est la régularité, pas la performance.',
  },
  {
    title: 'Full Body',
    exercises: [
      { exerciseId: 'ex-goblet-squat', sets: 3, reps: 12 },
      { exerciseId: 'ex-seated-cable-row', sets: 3, reps: 12 },
      { exerciseId: 'ex-push-up', sets: 3, reps: 12 },
      { exerciseId: 'ex-plank', sets: 3, reps: 30 },
    ],
  },
];

/**
 * Marketplace catalogue. Ids are stable slugs shared with the DB seed
 * (supabase/migrations/0004_community_marketplace.sql), so demo mode and the
 * real backend show the same programs. `sessionTemplates` is the source of
 * truth for both the "preview before enrolling" screen and the schedule
 * generated on enrollment (packages/engines/src/marketplace.ts).
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
    sessionTemplates: repeatWeekly(FORCE_FONDATIONS_PATTERN, 8, 3),
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
    sessionTemplates: repeatWithinWeek(FIVE_K_WEEKS, 3),
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
    sessionTemplates: repeatWeekly(HYROX_PATTERN, 10, 5),
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
    sessionTemplates: repeatWeekly(RECOMP_PATTERN, 12, 4),
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
    sessionTemplates: repeatWeekly(MOBILITE_PATTERN, 4, 6),
  },
];
