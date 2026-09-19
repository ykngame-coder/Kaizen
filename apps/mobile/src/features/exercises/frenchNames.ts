/**
 * Noms français pour les mouvements de free-exercise-db qu'on met en avant.
 *
 * Le catalogue importé garde les libellés de la source, en anglais : un
 * programme de coach affichait « Running, Treadmill » en plein écran pendant la
 * séance. Le fichier de données reste un miroir 1:1 de la source amont (voir
 * hyroxSupplement.ts) ; la traduction se pose donc par-dessus, à la lecture.
 *
 * Seuls les mouvements réellement employés sont traduits — traduire les 873
 * entrées à la main vieillirait mal, et la bibliothèque affiche le nom d'origine
 * quand il n'y a pas mieux.
 */
export const FRENCH_EXERCISE_NAMES: Record<string, string> = {
  Running_Treadmill: 'Course sur tapis',
  Jogging_Treadmill: 'Footing sur tapis',
  Walking_Treadmill: 'Marche sur tapis',
  Rowing_Stationary: 'Rameur',
  Elliptical_Trainer: 'Vélo elliptique',
  Recumbent_Bike: 'Vélo allongé',
  Air_Bike: 'Vélo à air',
  Bodyweight_Squat: 'Squat au poids du corps',
  Chair_Squat: 'Squat sur chaise',
  Sled_Push: 'Poussée de traîneau',
  'Sled Pull': 'Tirage de traîneau',
  Farmers_Walk: 'Marche du fermier',
  Hip_Extension_with_Bands: 'Extension de hanche à l’élastique',
  Double_Leg_Butt_Kick: 'Talons-fesses',
  Single_Leg_Butt_Kick: 'Talons-fesses (unilatéral)',
  'Wall Ball Shot': 'Wall ball',
  'Burpee Broad Jump': 'Burpee saut en longueur',
  'High Knees': 'Montées de genoux',
  'Butt Kicks': 'Talons-fesses',
};
