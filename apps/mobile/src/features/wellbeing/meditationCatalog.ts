export type MeditationCategory = 'sommeil' | 'stress' | 'matin' | 'focus';

export const MEDITATION_CATEGORIES: { key: MeditationCategory; label: string; icon: string }[] = [
  { key: 'sommeil', label: 'Sommeil', icon: '🌙' },
  { key: 'stress', label: 'Anti-stress', icon: '🧘' },
  { key: 'matin', label: 'Réveil', icon: '☀️' },
  { key: 'focus', label: 'Focus', icon: '🎯' },
];

export interface MeditationSession {
  id: string;
  title: string;
  category: MeditationCategory;
  durationSec: number;
  /** Object path inside the `meditation-audio` Supabase Storage bucket. */
  audioPath: string;
  /**
   * False until a real narrated file has been uploaded to the bucket at
   * `audioPath` — flip to true (per session) once it's there. Keeps the
   * screen honest about what's actually playable instead of silently
   * failing on a missing file.
   */
  available: boolean;
}

export const MEDITATION_CATALOG: MeditationSession[] = [
  { id: 'sommeil-endormissement', title: 'Endormissement', category: 'sommeil', durationSec: 600, audioPath: 'sommeil/endormissement.mp3', available: false },
  { id: 'sommeil-scan-corporel', title: 'Scan corporel du soir', category: 'sommeil', durationSec: 480, audioPath: 'sommeil/scan-corporel.mp3', available: false },
  { id: 'stress-respiration', title: 'Respiration anti-stress', category: 'stress', durationSec: 300, audioPath: 'stress/respiration.mp3', available: false },
  { id: 'stress-lacher-prise', title: 'Lâcher-prise', category: 'stress', durationSec: 600, audioPath: 'stress/lacher-prise.mp3', available: false },
  { id: 'matin-reveil-en-douceur', title: 'Réveil en douceur', category: 'matin', durationSec: 300, audioPath: 'matin/reveil-en-douceur.mp3', available: false },
  { id: 'matin-intention-du-jour', title: 'Intention du jour', category: 'matin', durationSec: 240, audioPath: 'matin/intention-du-jour.mp3', available: false },
  { id: 'focus-avant-seance', title: 'Concentration avant séance', category: 'focus', durationSec: 300, audioPath: 'focus/avant-seance.mp3', available: false },
  { id: 'focus-pause-profonde', title: 'Pause profonde', category: 'focus', durationSec: 420, audioPath: 'focus/pause-profonde.mp3', available: false },
];
