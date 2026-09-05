import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { BlockFormat, MuscleGroup } from '@supotsu/core';
import type { SessionBlockInput, SessionExerciseInput } from '@supotsu/shared';
import { EXERCISES, MUSCLE_LABEL, type Exercise } from '@/features/exercises/catalog';

export interface SetDraft {
  /** The real exercise this slot references — `order`/`selected` are keyed by a synthetic slot id, not this, so the same exercise can appear more than once in a block. */
  exerciseId: string;
  reps: string;
  weight: string;
  rest: string;
  /** Warm-up slot: kept out of volume and records. Set by the runner's auto-ramp (lot 2) or by hand. */
  isWarmup?: boolean;
}

export interface BlockDraft {
  format: BlockFormat;
  timeCapSec: string;
  targetRounds: string;
  /** Slot ids, in display/execution order — not exercise ids (an exercise can have more than one slot). */
  order: string[];
  selected: Record<string, SetDraft>;
  /** slotId -> group number. Members are only an active superset when also adjacent in `order`. */
  supersetGroups: Record<string, number>;
}

let slotSeq = 0;
/** A fresh per-slot key, distinct from the exercise id, so adding the same exercise twice creates two independent slots instead of overwriting one. */
export function newSlotId(exerciseId: string): string {
  slotSeq += 1;
  return `${exerciseId}::${slotSeq}`;
}

export const emptySet = (exerciseId: string): SetDraft => ({ exerciseId, reps: '', weight: '', rest: '' });
// targetRounds starts blank: a plain strength block now also exposes this
// field (to repeat as a circuit), and a pre-filled "10" would silently turn
// every new block's live run into a 10-round circuit before the user ever
// touched it. AMRAP/EMOM/Pour le temps still work fine with an empty value —
// their own compute functions already fall back to `?? 1`/`?? 0`.
export const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', targetRounds: '', order: [], selected: {}, supersetGroups: {} });

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
  /** Copies a block's format, rounds/cap and full exercise list into a new block right after it. */
  const duplicateBlock = (index: number): void => {
    setBlocks((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const copy: BlockDraft = { ...source, order: [...source.order], selected: { ...source.selected } };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActiveBlock(index + 1);
  };
  const groupAsSuperset = (slotIds: string[]): void => {
    if (slotIds.length < 2) return;
    const current = blocks[activeBlock]?.supersetGroups ?? {};
    const nextId = 1 + Math.max(0, ...Object.values(current));
    const patch: Record<string, number> = {};
    for (const id of slotIds) patch[id] = nextId;
    updateActiveBlock({ supersetGroups: { ...current, ...patch } });
  };
  const ungroup = (slotId: string): void => {
    const current = { ...(blocks[activeBlock]?.supersetGroups ?? {}) };
    delete current[slotId];
    updateActiveBlock({ supersetGroups: current });
  };

  /** Adds a new slot for this exercise — a fresh slot every call, so adding the same exercise again doesn't overwrite its earlier slot. */
  const addExercise = (exerciseId: string): void => {
    const slotId = newSlotId(exerciseId);
    updateActiveBlock({ selected: { ...activeSelected, [slotId]: emptySet(exerciseId) }, order: [...activeOrder, slotId] });
    setQuery('');
  };
  const removeExercise = (slotId: string): void => {
    const nextSelected = { ...activeSelected };
    delete nextSelected[slotId];
    updateActiveBlock({ selected: nextSelected, order: activeOrder.filter((id) => id !== slotId) });
  };
  const updateExercise = (slotId: string, patch: Partial<SetDraft>): void => {
    updateActiveBlock({ selected: { ...activeSelected, [slotId]: { ...activeSelected[slotId]!, ...patch } } });
  };
  const reorderExercise = (fromIndex: number, toIndex: number): void => {
    const next = [...activeOrder];
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) return;
    next.splice(toIndex, 0, moved);
    updateActiveBlock({ order: next });
  };

  // No longer excludes exercises already in the block — the same exercise
  // can now get a second slot (e.g. a second superset pair, or just logging
  // it twice with different reps/charge).
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => allExercises
      .filter((ex) => muscleFilter === 'all' || ex.primary === muscleFilter || ex.secondary.includes(muscleFilter))
      .filter((ex) => equipmentFilter === 'all' || ex.equipment === equipmentFilter)
      .filter((ex) => !q || ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q))
      .slice(0, RESULTS_LIMIT),
    [allExercises, muscleFilter, equipmentFilter, q],
  );

  const recentExercises = useMemo(() => {
    const ids = options.recentExerciseIds ?? [];
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const ex = byId.get(id);
      if (!ex) continue;
      seen.add(id);
      out.push(ex);
      if (out.length >= 8) break;
    }
    return out;
  }, [options.recentExerciseIds, byId]);

  // A single strength block with no repeat count and no superset grouping is
  // still the plain flat-sets flow (no block/round concept needed); as soon
  // as either is set, it needs the real block path so they get saved.
  const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength' && !blocks[0]!.targetRounds && Object.keys(blocks[0]!.supersetGroups).length === 0;
  const hasAnyExercise = blocks.some((b) => b.order.length > 0);

  return {
    name, setName,
    blocks, setBlocks, activeBlock, setActiveBlock, updateActiveBlock, addBlock, removeBlock, duplicateBlock, groupAsSuperset, ungroup,
    activeOrder, activeSelected,
    query, setQuery, muscleFilter, setMuscleFilter, equipmentFilter, setEquipmentFilter,
    allExercises, byId, searchResults, recentExercises,
    addExercise, removeExercise, updateExercise, reorderExercise,
    isSingleStrength, hasAnyExercise,
  };
}

export type SessionBlocksBuilder = ReturnType<typeof useSessionBlocks>;

/**
 * Converts the builder's blocks into the library's SessionBlockInput shape —
 * used when saving a (possibly multi-block) session into "Mes séances".
 * Unlike the old flattenBlocksToExercises, block boundaries and format are
 * preserved (the library now has its own block model, see
 * user_session_blocks). Blocks with zero exercises are dropped since
 * userSessionInputSchema requires at least one exercise per block.
 */
export function blocksToSessionInput(blocks: BlockDraft[]): SessionBlockInput[] {
  const out: SessionBlockInput[] = [];
  for (const block of blocks) {
    const exercises: SessionExerciseInput[] = [];
    for (const slotId of block.order) {
      const draft = block.selected[slotId];
      if (!draft) continue;
      exercises.push({
        exerciseId: draft.exerciseId,
        order: exercises.length,
        reps: draft.reps ? Number(draft.reps) : undefined,
        weightKg: draft.weight ? Number(draft.weight) : undefined,
        restSec: block.format === 'strength' && draft.rest ? Number(draft.rest) : undefined,
      });
    }
    if (exercises.length === 0) continue;
    out.push({
      format: block.format,
      timeCapSec:
        block.format === 'amrap' || block.format === 'for_time'
          ? (Number(block.timeCapSec) || 0) * 60 || undefined
          : block.format === 'emom'
            ? Number(block.timeCapSec) || undefined
            : undefined,
      targetRounds: block.format === 'emom' || block.format === 'for_time' || block.format === 'strength' ? Number(block.targetRounds) || undefined : undefined,
      exercises,
    });
  }
  return out;
}
