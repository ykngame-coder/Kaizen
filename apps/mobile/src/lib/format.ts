/** Small display formatters shared across screens. */

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m} min`;
}

export function formatDistance(meters?: number): string | null {
  if (!meters) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  walking: 'Marche',
  running: 'Course',
  cycling: 'Vélo',
  swimming: 'Natation',
  strength: 'Musculation',
  cross_training: 'Cross-training',
  hyrox: 'Hyrox',
  mobility: 'Mobilité',
  yoga: 'Yoga',
  other: 'Autre',
};

export const activityLabel = (type: string): string => ACTIVITY_LABELS[type] ?? type;

/**
 * Ce qu'il faut afficher pour une activité.
 *
 * Une activité importée arrive souvent en type `other` avec son vrai nom dans
 * les notes ; l'afficher « Autre », ou pire « other » brut, perd la seule
 * information utile. La règle vivait en double dans l'historique et le détail,
 * et manquait au hub Sport — qui affichait donc `other` tel quel.
 */
export function activityTitle(type: string, notes?: string): string {
  if (type === 'other' && notes && notes.trim()) return notes.trim();
  return activityLabel(type);
}

/**
 * Heures et minutes d'une durée, arrondies à la minute.
 *
 * L'arrondi porte sur le total avant le découpage : le calculer séparément
 * pour l'heure et pour les minutes laissait un reste de 59 min 30 s s'arrondir
 * à 60 sans incrémenter l'heure, d'où le « 3 h 60 » affiché dans le hub Sport.
 */
export function splitDuration(sec: number): { h: number; m: number } {
  const totalMin = Math.round(sec / 60);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
