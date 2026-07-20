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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
