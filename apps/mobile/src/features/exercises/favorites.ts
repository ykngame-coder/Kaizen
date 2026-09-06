import { secureStorage } from '@/lib/secure-storage';

/**
 * Exercices mis en favori, par utilisateur. Purement local : c'est un confort
 * de saisie, pas une donnée d'entraînement — rien à synchroniser.
 */
const key = (userId: string): string => `supotsu.favoriteExercises.${userId}`;

export async function loadFavorites(userId: string): Promise<string[]> {
  const raw = await secureStorage.getItem(key(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Store corrompu : on repart d'une liste vide plutôt que de bloquer la saisie.
    return [];
  }
}

/** Bascule un exercice en favori et renvoie la liste résultante. */
export async function toggleFavorite(userId: string, exerciseId: string): Promise<string[]> {
  const current = await loadFavorites(userId);
  const next = current.includes(exerciseId)
    ? current.filter((id) => id !== exerciseId)
    : [exerciseId, ...current];
  await secureStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
