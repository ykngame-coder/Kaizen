import { getSupabase } from '@/lib/supabase';

/** Public URL for a bilateral ambient audio file, or null in demo mode (no backend configured). */
export function bilateralAudioUrl(audioPath: string): string | null {
  const client = getSupabase();
  if (!client) return null;
  return client.storage.from('bilateral-audio').getPublicUrl(audioPath).data.publicUrl;
}
