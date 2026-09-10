import { describe, expect, it } from 'vitest';
import { mergeSleepTimeline, type StageInterval } from './sleepMerge';

const at = (h: number, m = 0): string => new Date(Date.UTC(2026, 8, 9, h, m)).toISOString();
const iv = (stage: StageInterval['stage'], fromH: number, toH: number, fromM = 0, toM = 0): StageInterval => ({
  stage,
  startedAt: at(fromH, fromM),
  endedAt: at(toH, toM),
});

describe('mergeSleepTimeline', () => {
  it('somme des intervalles disjoints sans y toucher', () => {
    const r = mergeSleepTimeline([iv('deep', 0, 1), iv('light', 1, 3)]);
    expect(r.deepMin).toBe(60);
    expect(r.lightMin).toBe(120);
    expect(r.asleepMin).toBe(180);
  });

  it('ne compte qu une fois une nuit vue par DEUX sources', () => {
    // Le bug : Apple Watch + AutoSleep sur la même nuit donnaient ~14 h.
    const watch = [iv('deep', 0, 2), iv('light', 2, 7)];
    const autosleep = [iv('deep', 0, 2), iv('light', 2, 7)];
    const r = mergeSleepTimeline([...watch, ...autosleep]);
    expect(r.asleepMin).toBe(7 * 60);
    expect(r.deepMin).toBe(120);
    expect(r.lightMin).toBe(5 * 60);
  });

  it('tranche en faveur du stade le plus profond quand deux sources se contredisent', () => {
    // Même instant, deux avis : on n'additionne pas, on choisit.
    const r = mergeSleepTimeline([iv('light', 0, 2), iv('deep', 0, 2)]);
    expect(r.deepMin).toBe(120);
    expect(r.lightMin).toBe(0);
    expect(r.asleepMin).toBe(120);
  });

  it('fusionne un chevauchement partiel sans perdre les bords', () => {
    const r = mergeSleepTimeline([iv('light', 0, 3), iv('light', 2, 5)]);
    expect(r.lightMin).toBe(5 * 60);
  });

  it('garde éveil et « au lit » hors du temps endormi', () => {
    const r = mergeSleepTimeline([iv('light', 0, 6), iv('awake', 6, 7), iv('inBed', 7, 8)]);
    expect(r.asleepMin).toBe(6 * 60);
    expect(r.awakeMin).toBe(60);
    expect(r.inBedMin).toBe(60);
  });

  it('ignore un intervalle de durée nulle ou inversée', () => {
    const r = mergeSleepTimeline([iv('deep', 2, 2), { stage: 'deep', startedAt: at(5), endedAt: at(3) }]);
    expect(r.asleepMin).toBe(0);
  });

  it('rend des segments qui ne se chevauchent plus', () => {
    const r = mergeSleepTimeline([iv('light', 0, 3), iv('deep', 1, 2)]);
    const total = r.segments.reduce(
      (s, g) => s + (new Date(g.endedAt).getTime() - new Date(g.startedAt).getTime()) / 60000,
      0,
    );
    expect(total).toBe(180);
    for (let i = 1; i < r.segments.length; i += 1) {
      expect(r.segments[i]!.startedAt >= r.segments[i - 1]!.endedAt).toBe(true);
    }
  });

  it('supporte une liste vide', () => {
    expect(mergeSleepTimeline([])).toMatchObject({ asleepMin: 0, segments: [] });
  });
});
