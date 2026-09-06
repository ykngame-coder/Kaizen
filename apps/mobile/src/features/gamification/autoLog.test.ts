import { describe, expect, it } from 'vitest';
import { claimAutoLog } from './linkedHabits';

/**
 * Régression : l'auto-log des habitudes liées se redéclenchait à chaque rendu
 * tant que l'écriture n'était pas revenue du serveur, et `mutate` provoquant
 * lui-même un rendu, il s'auto-alimentait. Le test rejoue cette boucle.
 */
describe('claimAutoLog', () => {
  it('ne laisse passer qu une écriture par habitude et par jour', () => {
    const attempted = new Set<string>();
    expect(claimAutoLog(attempted, 'habit-1', '2026-09-06')).toBe(true);
    expect(claimAutoLog(attempted, 'habit-1', '2026-09-06')).toBe(false);
  });

  it('tient bon sur une rafale de rendus avant toute réponse serveur', () => {
    const attempted = new Set<string>();
    // 200 rendus consécutifs, aucun refetch entre-temps : c'est exactement la
    // fenêtre pendant laquelle des centaines de doublons étaient insérés.
    const writes = Array.from({ length: 200 }, () => claimAutoLog(attempted, 'habit-1', '2026-09-06')).filter(Boolean);
    expect(writes).toHaveLength(1);
  });

  it('isole les habitudes entre elles et les jours entre eux', () => {
    const attempted = new Set<string>();
    expect(claimAutoLog(attempted, 'habit-1', '2026-09-06')).toBe(true);
    expect(claimAutoLog(attempted, 'habit-2', '2026-09-06')).toBe(true);
    expect(claimAutoLog(attempted, 'habit-1', '2026-09-07')).toBe(true);
    expect(claimAutoLog(attempted, 'habit-1', '2026-09-06')).toBe(false);
  });
});
