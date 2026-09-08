import { describe, expect, it } from 'vitest';
import { computeTabataState, tabataTotalSec } from './blockRunnerEngine';

// Tabata canonique : 20 s de travail, 10 s de repos, 8 rounds.
const T = { work: 20, rest: 10, rounds: 8 };
const at = (elapsed: number) => computeTabataState(elapsed, T.work, T.rest, T.rounds);

describe('tabataTotalSec', () => {
  it('ne compte pas de repos après le dernier travail', () => {
    // 8×20 + 7×10 = 230, et non 240 : le bloc finit sur le travail.
    expect(tabataTotalSec(20, 10, 8)).toBe(230);
  });

  it('vaut la seule durée de travail quand il n y a qu un round', () => {
    expect(tabataTotalSec(20, 10, 1)).toBe(20);
  });

  it('dégénère en EMOM quand le repos est nul', () => {
    expect(tabataTotalSec(60, 0, 10)).toBe(600);
  });
});

describe('computeTabataState', () => {
  it('démarre sur le travail du premier round, décompte plein', () => {
    expect(at(0)).toEqual({ displaySec: 20, currentRound: 1, phase: 'work', isFinished: false });
  });

  it('décompte pendant le travail', () => {
    expect(at(5)).toMatchObject({ displaySec: 15, currentRound: 1, phase: 'work' });
    expect(at(19)).toMatchObject({ displaySec: 1, currentRound: 1, phase: 'work' });
  });

  it('bascule sur le repos à la frontière exacte du travail', () => {
    expect(at(20)).toEqual({ displaySec: 10, currentRound: 1, phase: 'rest', isFinished: false });
    expect(at(29)).toMatchObject({ displaySec: 1, phase: 'rest', currentRound: 1 });
  });

  it('passe au round suivant à la frontière exacte du repos', () => {
    expect(at(30)).toEqual({ displaySec: 20, currentRound: 2, phase: 'work', isFinished: false });
  });

  it('garde le round juste avant la fin du dernier travail', () => {
    // 7 rounds pleins = 210 s, puis le 8e travail.
    expect(at(210)).toMatchObject({ currentRound: 8, phase: 'work', displaySec: 20, isFinished: false });
    expect(at(229)).toMatchObject({ currentRound: 8, phase: 'work', displaySec: 1, isFinished: false });
  });

  it('termine à la fin du dernier travail, sans repos final', () => {
    expect(at(230)).toEqual({ displaySec: 0, currentRound: 8, phase: 'work', isFinished: true });
  });

  it('reste terminé au-delà', () => {
    expect(at(400)).toMatchObject({ isFinished: true, displaySec: 0, currentRound: 8 });
  });

  it('n a jamais de phase repos quand le repos est nul', () => {
    for (const e of [0, 59, 60, 61, 599]) {
      expect(computeTabataState(e, 60, 0, 10).phase).toBe('work');
    }
    expect(computeTabataState(600, 60, 0, 10).isFinished).toBe(true);
  });

  it('supporte un round unique', () => {
    expect(computeTabataState(0, 20, 10, 1)).toMatchObject({ currentRound: 1, phase: 'work' });
    expect(computeTabataState(20, 20, 10, 1)).toMatchObject({ isFinished: true, displaySec: 0 });
  });
});
