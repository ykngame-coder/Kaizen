import type { SupotsuClient } from '../client';
import type { Database } from '../generated/database.types';

export type SessionLinkRow = Database['public']['Tables']['session_links']['Row'];

/**
 * Les rapprochements (ou séparations) décidés à la main par l'utilisateur.
 *
 * Une erreur ne remonte pas : ces corrections sont un confort, et le calcul
 * qui s'en sert — la récupération musculaire — doit marcher sans elles. Tant
 * que la migration 0042 n'est pas passée, la table n'existe pas et toute la
 * page des muscles tombait avec la requête.
 */
export async function listSessionLinks(client: SupotsuClient, userId: string): Promise<SessionLinkRow[]> {
  const { data, error } = await client.from('session_links').select('*').eq('user_id', userId);
  if (error) return [];
  return data ?? [];
}

/** Enregistre une décision ; la dernière remplace la précédente pour ce couple. */
export async function setSessionLink(
  client: SupotsuClient,
  userId: string,
  workoutId: string,
  activityId: string,
  mode: 'linked' | 'separate',
): Promise<void> {
  const { error } = await client
    .from('session_links')
    .upsert({ user_id: userId, workout_id: workoutId, activity_id: activityId, mode },
      { onConflict: 'user_id,workout_id,activity_id' });
  if (error) throw error;
}
