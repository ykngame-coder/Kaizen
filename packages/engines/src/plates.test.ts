import { describe, expect, it } from 'vitest';
import { computePlates } from './plates';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('computePlates', () => {
  it('décompose une charge atteignable exactement', () => {
    // 62,5 = barre 20 + 2 x (20 + 1,25)
    expect(computePlates(62.5, 20, PLATES)).toEqual({
      perSide: [{ plateKg: 20, count: 1 }, { plateKg: 1.25, count: 1 }],
      achievedKg: 62.5,
    });
  });

  it('empile plusieurs fois le même disque', () => {
    expect(computePlates(120, 20, PLATES)).toEqual({
      perSide: [{ plateKg: 25, count: 2 }],
      achievedKg: 120,
    });
  });

  it('rend la barre nue quand la cible vaut la barre', () => {
    expect(computePlates(20, 20, PLATES)).toEqual({ perSide: [], achievedKg: 20 });
  });

  it('retourne undefined sous le poids de la barre', () => {
    expect(computePlates(15, 20, PLATES)).toBeUndefined();
  });

  it('descend au plus proche atteignable quand la cible ne tombe pas juste', () => {
    // 61 kg impossible avec ces disques : 60 est le plus proche en dessous.
    const s = computePlates(61, 20, PLATES)!;
    expect(s.achievedKg).toBe(60);
    expect(s.perSide).toEqual([{ plateKg: 20, count: 1 }]);
  });

  it('trie les disques fournis en désordre et ignore les valeurs invalides', () => {
    expect(computePlates(62.5, 20, [1.25, 20, 0, -5, 20])).toEqual({
      perSide: [{ plateKg: 20, count: 1 }, { plateKg: 1.25, count: 1 }],
      achievedKg: 62.5,
    });
  });

  it('retourne la barre nue quand aucun disque n’est disponible', () => {
    expect(computePlates(60, 20, [])).toEqual({ perSide: [], achievedKg: 20 });
  });
});
