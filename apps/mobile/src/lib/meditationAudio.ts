import { getSupabase } from '@/lib/supabase';

/** Public URL for a meditation audio file, or null in demo mode (no backend configured). */
export function meditationAudioUrl(audioPath: string): string | null {
  const client = getSupabase();
  if (!client) return null;
  return client.storage.from('meditation-audio').getPublicUrl(audioPath).data.publicUrl;
}
