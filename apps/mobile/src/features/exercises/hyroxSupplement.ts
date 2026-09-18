import type { Exercise } from './catalog';

/**
 * Mouvements Hyrox absents de free-exercise-db (vérifié le 2026-09-18).
 * Fichier séparé plutôt que mélangés dans exercises.data.json : ce fichier se
 * présente comme un miroir 1:1 de free-exercise-db, y ajouter des entrées à
 * la main romprait cette garantie et les ferait perdre à toute regénération
 * future depuis la source amont.
 */
export const HYROX_SUPPLEMENT: Exercise[] = [
  {
    id: 'Wall Ball Shot',
    name: 'Wall Ball Shot',
    primary: 'quads',
    secondary: ['shoulders', 'core'],
    category: 'cardio',
    equipment: 'Medecine ball',
    level: 'Intermédiaire',
    mechanic: 'compound',
    instructions: [
      'Tiens le medecine ball devant la poitrine, pieds largeur d’épaules, une cible au mur devant toi.',
      'Descends en squat complet, ballon toujours contre la poitrine.',
      'Remonte en poussant sur les jambes et lance le ballon vers la cible au-dessus de toi.',
      'Rattrape le ballon en redescendant dans le squat suivant. Répète.',
    ],
    image: null,
  },
  {
    id: 'Burpee Broad Jump',
    name: 'Burpee Broad Jump',
    primary: 'full_body',
    secondary: ['quads', 'shoulders'],
    category: 'cardio',
    equipment: 'Poids du corps',
    level: 'Intermédiaire',
    mechanic: 'compound',
    instructions: [
      'Départ debout. Descends en squat et pose les mains au sol.',
      'Envoie les pieds en arrière d’un saut pour te retrouver en position de pompe, fais une pompe.',
      'Ramène les pieds vers les mains d’un saut, puis enchaîne directement sur un saut en longueur vers l’avant.',
      'Réceptionne-toi sur les deux pieds et repars immédiatement dans le burpee suivant.',
    ],
    image: null,
  },
  {
    id: 'Sled Pull',
    name: 'Sled Pull',
    primary: 'back',
    secondary: ['hamstrings', 'biceps'],
    category: 'force',
    equipment: 'Sled',
    level: 'Intermédiaire',
    mechanic: 'compound',
    instructions: [
      'Attache la corde au sled, tiens-toi face à lui, corde en main.',
      'Tire le sled vers toi en enchaînant les prises de corde, bras puis dos, sans à-coups.',
      'Marche ou recule pour accompagner le mouvement selon la longueur de corde disponible.',
      'Continue jusqu’à ce que le sled ait parcouru la distance prévue.',
    ],
    image: null,
  },
  {
    id: 'SkiErg',
    name: 'SkiErg',
    primary: 'back',
    secondary: ['triceps', 'core'],
    category: 'cardio',
    equipment: 'Ski erg',
    level: 'Intermédiaire',
    mechanic: 'compound',
    instructions: [
      'Empoigne les deux poignées, bras tendus au-dessus de la tête, léger appui sur les jambes.',
      'Tire les poignées vers le bas en engageant le dos et les bras, buste qui s’incline vers l’avant.',
      'Termine le mouvement hanches fléchies, poignées près des cuisses.',
      'Reviens en position haute de façon contrôlée et enchaîne.',
    ],
    image: null,
  },
];
