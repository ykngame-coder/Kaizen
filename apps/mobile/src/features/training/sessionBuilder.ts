import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { BlockFormat, MuscleGroup } from '@supotsu/core';
import { EXERCISES, MUSCLE_LABEL, type Exercise } from '@/features/exercises/catalog';

export interface SetDraft {
  reps: string;
  weight: string;
  rest: string;
}

export interface BlockDraft {
  format: BlockFormat;
  timeCapSec: string;
  targetRounds: string;
  order: string[];
  selected: Record<string, SetDraft>;
}

export const emptySet = (): SetDraft => ({ reps: '', weight: '', rest: '' });
export const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', targetRounds: '10', order: [], selected: {} });

export function formatLabel(format: BlockFormat, t: TFunction): string {
  if (format === 'strength') return t('sport.sessionBuilder.blockFormat.strength');
  if (format === 'for_time') return t('sport.sessionBuilder.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  return 'EMOM';
}

const RESULTS_LIMIT = 60;

export interface UseSessionBlocksOptions {
  initialName?: string;
  initialBlocks?: BlockDraft[];
  /** Exercise ids the user has trained before, most-recent first — powers the "Récemment utilisés" row. */
  recentExerciseIds?: string[];
  /** The caller's own custom exercises, already adapted to the catalogue shape. */
  customExercises?: Exercise[];
  /**
   * Extra exercises resolvable by id (so a pre-filled/imported session's rows
   * still show a name) without being offered in search/browse results —
   * e.g. auto-mapped import ids that aren't part of the normal catalogue.
   */
  resolvableExercises?: Exercise[];
}

/**
 * State + handlers for the block/exercise editor shared by NewWorkoutScreen,
 * EditWorkoutScreen and SessionBuilderScreen (rendered by SessionBlocksEditor).
 * Purely client-side draft state — screens own submission and destination.
 */
export function useSessionBlocks(options: UseSessionBlocksOptions = {}) {
  const [name, setName] = useState(options.initialName ?? '');
  const [blocks, setBlocks] = useState<BlockDraft[]>(options.initialBlocks ?? [emptyBlock()]);
  const [activeBlock, setActiveBlock] = useState(0);
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string | 'all'>('all');

  const allExercises = useMemo(
    () => [...(options.customExercises ?? []), ...EXERCISES],
    [options.customExercises],
  );
  const byId = useMemo(() => {
    const map = new Map(allExercises.map((ex) => [ex.id, ex]));
    for (const ex of options.resolvableExercises ?? []) if (!map.has(ex.id)) map.set(ex.id, ex);
    return map;
  }, [allExercises, options.resolvableExercises]);

  const activeOrder = blocks[activeBlock]?.order ?? [];
  const activeSelected = blocks[activeBlock]?.selected ?? {};

  const updateActiveBlock = (patch: Partial<BlockDraft>): void => {
    setBlocks((prev) => prev.map((b, i) => (i === activeBlock ? { ...b, ...patch } : b)));
  };
  const addBlock = (): void => {
    setBlocks((prev) => [...prev, emptyBlock()]);
    setActiveBlock(blocks.length);
  };
  const removeBlock = (index: number): void => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setActiveBlock(0);
  };

  const addExercise = (exerciseId: string): void => {
    updateActiveBlock({ selected: { ...activeSelected, [exerciseId]: emptySet() }, order: [...activeOrder, exerciseId] });
    setQuery('');
  };
  const removeExercise = (exerciseId: string): void => {
    const nextSelected = { ...activeSelected };
    delete nextSelected[exerciseId];
    updateActiveBlock({ selected: nextSelected, order: activeOrder.filter((id) => id !== exerciseId) });
  };
  const updateExercise = (exerciseId: string, patch: Partial<SetDraft>): void => {
    updateActiveBlock({ selected: { ...activeSelected, [exerciseId]: { ...activeSelected[exerciseId]!, ...patch } } });
  };
  const reorderExercise = (fromIndex: number, toIndex: number): void => {
    const next = [...activeOrder];
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) return;
    next.splice(toIndex, 0, moved);
    updateActiveBlock({ order: next });
  };

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => allExercises
      .filter((ex) => !activeSelected[ex.id])
      .filter((ex) => muscleFilter === 'all' || ex.primary === muscleFilter || ex.secondary.includes(muscleFilter))
      .filter((ex) => equipmentFilter === 'all' || ex.equipment === equipmentFilter)
      .filter((ex) => !q || ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q))
      .slice(0, RESULTS_LIMIT),
    [allExercises, activeSelected, muscleFilter, equipmentFilter, q],
  );

  const recentExercises = useMemo(() => {
    const ids = options.recentExerciseIds ?? [];
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const id of ids) {
      if (seen.has(id) || activeSelected[id]) continue;
      const ex = byId.get(id);
      if (!ex) continue;
      seen.add(id);
      out.push(ex);
      if (out.length >= 8) break;
    }
    return out;
  }, [options.recentExerciseIds, byId, activeSelected]);

  const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength';
  const hasAnyExercise = blocks.some((b) => b.order.length > 0);

  return {
    name, setName,
    blocks, setBlocks, activeBlock, setActiveBlock, updateActiveBlock, addBlock, removeBlock,
    activeOrder, activeSelected,
    query, setQuery, muscleFilter, setMuscleFilter, equipmentFilter, setEquipmentFilter,
    allExercises, byId, searchResults, recentExercises,
    addExercise, removeExercise, updateExercise, reorderExercise,
    isSingleStrength, hasAnyExercise,
  };
}

export type SessionBlocksBuilder = ReturnType<typeof useSessionBlocks>;

export interface FlatSessionExercise {
  exerciseId: string;
  order: number;
  reps?: number;
  weightKg?: number;
  restSec?: number;
}

/**
 * Flattens all blocks into one sequential exercise list — used when saving a
 * (possibly multi-block) session into the "Mes séances" library, whose
 * UserSessionExercise model has no concept of blocks/formats. Block
 * boundaries are lost; the exercise order is preserved.
 */
export function flattenBlocksToExercises(blocks: BlockDraft[]): FlatSessionExercise[] {
  const out: FlatSessionExercise[] = [];
  for (const block of blocks) {
    for (const exerciseId of block.order) {
      const draft = block.selected[exerciseId];
      if (!draft) continue;
      out.push({
        exerciseId,
        order: out.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: block.format === 'strength' && draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
      });
    }
  }
  return out;
}
