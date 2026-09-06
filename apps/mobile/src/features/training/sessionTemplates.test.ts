import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/features/exercises/catalog';
import { SESSION_TEMPLATES, templateToBlocks } from './sessionTemplates';

const CATALOG_IDS = new Set(EXERCISES.map((e) => e.id));

describe('SESSION_TEMPLATES', () => {
  it('ne référence que des exercices du catalogue', () => {
    // Un id absent s'afficherait en brut à l'écran ("Barbell_Bench_Press"),
    // exactement le défaut corrigé au build 45.
    const unknown = SESSION_TEMPLATES.flatMap((tpl) =>
      tpl.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)),
    ).filter((id) => !CATALOG_IDS.has(id));
    expect(unknown).toEqual([]);
  });

  it('donne au moins un exercice à chaque bloc', () => {
    for (const tpl of SESSION_TEMPLATES) {
      for (const b of tpl.blocks) expect(b.exercises.length).toBeGreaterThan(0);
    }
  });

  it('emploie des identifiants de modèle uniques', () => {
    const ids = SESSION_TEMPLATES.map((tpl) => tpl.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('templateToBlocks', () => {
  it('reporte reps, repos et plafond de temps', () => {
    const fullBody = SESSION_TEMPLATES.find((tpl) => tpl.id === 'full-body')!;
    const [block] = templateToBlocks(fullBody);
    expect(block!.format).toBe('strength');
    expect(block!.order).toHaveLength(4);
    const first = block!.selected[block!.order[0]!]!;
    expect(first.reps).toBe('8');
    expect(first.rest).toBe('120');
  });

  it('garde le plafond AMRAP en minutes, comme le brouillon l’attend', () => {
    const wod = SESSION_TEMPLATES.find((tpl) => tpl.id === 'wod-amrap')!;
    const [block] = templateToBlocks(wod);
    expect(block!.format).toBe('amrap');
    expect(block!.timeCapSec).toBe('12');
  });

  it('crée un slot distinct par exercice', () => {
    const wod = SESSION_TEMPLATES.find((tpl) => tpl.id === 'wod-amrap')!;
    const [block] = templateToBlocks(wod);
    expect(new Set(block!.order).size).toBe(block!.order.length);
  });
});
