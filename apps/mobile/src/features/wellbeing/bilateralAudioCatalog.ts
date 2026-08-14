export interface BilateralAmbientSound {
  id: string;
  title: string;
  /** Object path inside the `bilateral-audio` Supabase Storage bucket. */
  audioPath: string;
  /**
   * False until a real file has been uploaded to the bucket at `audioPath` —
   * flip to true (per sound) once it's there. Same pattern as
   * MeditationSession.available — keeps the screen honest about what's
   * actually playable instead of silently failing on a missing file.
   */
  available: boolean;
}

/**
 * Starter catalog — titles/paths are placeholders. Rename entries (or add
 * more) to match whatever ambient tracks actually get uploaded; the `id` and
 * `audioPath` are the only two things that need to line up with the files in
 * the `bilateral-audio` bucket.
 */
export const BILATERAL_AUDIO_CATALOG: BilateralAmbientSound[] = [
  { id: 'vagues', title: 'Vagues', audioPath: 'bilateral/vagues.mp3', available: false },
  { id: 'pluie', title: 'Pluie', audioPath: 'bilateral/pluie.mp3', available: false },
  { id: 'bruit-blanc', title: 'Bruit blanc', audioPath: 'bilateral/bruit-blanc.mp3', available: false },
  { id: 'bols-tibetains', title: 'Bols tibétains', audioPath: 'bilateral/bols-tibetains.mp3', available: false },
];
