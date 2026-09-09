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
  /** Plafond AMRAP, intervalle EMOM, ou secondes de travail Tabata. */
  timeCapSec: string;
  /** Secondes de repos — Tabata uniquement. */
  restSec: string;
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
export const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', restSec: '', targetRounds: '', order: [], selected: {}, supersetGroups: {} });

/**
 * Valeur de départ du champ temps pour un format donné. Le champ ne veut pas
 * dire la même chose d'un format à l'autre — minutes de plafond en AMRAP,
 * secondes d'intervalle en EMOM, minutes d'objectif *facultatif* en For Time —
 * donc le garder tel quel en changeant de format donne des non-sens : un « 12 »
 * d'AMRAP devient 12 secondes d'intervalle EMOM, ou un objectif que
 * l'utilisateur n'a jamais demandé en For Time.
 */
export function defaultTimeCapForFormat(format: BlockFormat): string {
  if (format === 'amrap') return '12';
  if (format === 'emom') return '60';
  // Tabata : le champ porte les secondes de TRAVAIL, 20 s par convention.
  if (format === 'tabata') return '20';
  // For Time : objectif facultatif — vide, pour que le placeholder s'affiche.
  return '';
}

/**
 * Forme comparable d'un texte de recherche : sans accent, en minuscules.
 * Sans ça, chercher « elevation » ne trouve pas « Élévation latérale » — le
 * catalogue est en français accentué et les claviers ne le sont pas toujours.
 */
export function normalizeSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function formatLabel(format: BlockFormat, t: TFunction): string {
  if (format === 'strength') return t('sport.sessionBuilder.blockFormat.strength');
  if (format === 'for_time') return t('sport.sessionBuilder.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  if (format === 'tabata') return 'Tabata';
  return 'EMOM';
}

/** Valeurs par défaut d'un Tabata canonique, appliquées en changeant de format. */
export function defaultRestForFormat(format: BlockFormat): string {
  return format === 'tabata' ? '10' : '';
}
export function defaultRoundsForFormat(format: BlockFormat): string {
  return format === 'tabata' ? '8' : '';
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
  /**
   * Dernière performance connue pour un exercice — sert à pré-remplir un slot
   * dès l'ajout, plutôt que de laisser l'utilisateur ressaisir ce qu'il a déjà
   * fait. Proposition éditable : rien n'est verrouillé.
   */
  lastKnownFor?: (exerciseId: string) => { reps?: number; weightKg?: number; restSec?: number } | undefined;
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
    const known = options.lastKnownFor?.(exerciseId);
    const draft: SetDraft = known
      ? {
          exerciseId,
          reps: known.reps != null ? String(known.reps) : '',
          weight: known.weightKg != null ? String(known.weightKg) : '',
          rest: known.restSec != null ? String(known.restSec) : '',
        }
      : emptySet(exerciseId);
    updateActiveBlock({ selected: { ...activeSelected, [slotId]: draft }, order: [...activeOrder, slotId] });
    setQuery('');
  };
  const removeExercise = (slotId: string): void => {
    const nextSelected = { ...activeSelected };
    delete nextSelected[slotId];
    updateActiveBlock({ selected: nextSelected, order: activeOrder.filter((id) => id !== slotId) });
  };
  /**
   * Une série de plus pour le même exercice, insérée juste après celle-ci et
   * pré-remplie à l'identique — on enchaîne le plus souvent 3×8 à la même
   * charge, et corriger une valeur est plus rapide que tout ressaisir.
   *
   * Le modèle acceptait déjà plusieurs séries (les slots sont des identifiants
   * synthétiques, distincts de l'exercice), il n'y avait simplement aucun
   * moyen d'en créer une depuis l'écran.
   */
  const duplicateSet = (slotId: string): void => {
    const source = activeSelected[slotId];
    if (!source) return;
    const newId = newSlotId(source.exerciseId);
    const at = activeOrder.indexOf(slotId);
    const order = [...activeOrder];
    order.splice(at < 0 ? order.length : at + 1, 0, newId);
    updateActiveBlock({ selected: { ...activeSelected, [newId]: { ...source } }, order });
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
  const q = normalizeSearch(query);
  const searchResults = useMemo(
    () => allExercises
      .filter((ex) => muscleFilter === 'all' || ex.primary === muscleFilter || ex.secondary.includes(muscleFilter))
      .filter((ex) => equipmentFilter === 'all' || ex.equipment === equipmentFilter)
      .filter(
        (ex) =>
          !q ||
          normalizeSearch(ex.name).includes(q) ||
          normalizeSearch(MUSCLE_LABEL[ex.primary]).includes(q) ||
          normalizeSearch(ex.equipment).includes(q),
      )
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
    addExercise, removeExercise, updateExercise, duplicateSet, reorderExercise,
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
/** Seconds a block's time field means once saved — minutes for AMRAP/For Time, already-seconds for EMOM/Tabata. */
function timeCapSecondsOf(block: BlockDraft): number | undefined {
  if (block.format === 'amrap' || block.format === 'for_time') {
    return (Number(block.timeCapSec) || 0) * 60 || undefined;
  }
  if (block.format === 'emom' || block.format === 'tabata') return Number(block.timeCapSec) || undefined;
  return undefined;
}

const HAS_ROUNDS: BlockFormat[] = ['emom', 'for_time', 'strength', 'tabata'];

/**
 * Drafts → the blocks of a dated workout.
 *
 * The counterpart of `blocksToSessionInput`, extracted because NewWorkoutScreen
 * and EditWorkoutScreen each carried their own copy of this mapping — and both
 * copies were missed when Tabata was added, so a Tabata block created there
 * silently lost its work, rest and rounds. One place to update per format now.
 */
export function blocksToWorkoutInput(blocks: BlockDraft[]): {
  format: BlockFormat;
  timeCapSec?: number;
  restSec?: number;
  targetRounds?: number;
  sets: {
    exerciseId: string;
    order: number;
    reps?: number;
    weightKg?: number;
    restSec?: number;
    isWarmup?: boolean;
    supersetGroup?: number;
  }[];
}[] {
  return blocks.map((b) => ({
    format: b.format,
    timeCapSec: timeCapSecondsOf(b),
    // 0 est un repos légitime (Tabata dégénéré en EMOM), donc test explicite.
    restSec: b.format === 'tabata' && b.restSec.trim() !== '' ? Number(b.restSec) : undefined,
    targetRounds: HAS_ROUNDS.includes(b.format) ? Number(b.targetRounds) || undefined : undefined,
    sets: b.order.map((slotId, i) => {
      const s = b.selected[slotId]!;
      return {
        exerciseId: s.exerciseId,
        order: i,
        reps: s.reps ? Number(s.reps) : undefined,
        weightKg: s.weight ? Number(s.weight) : undefined,
        restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
        isWarmup: s.isWarmup,
        supersetGroup: b.supersetGroups[slotId],
      };
    }),
  }));
}

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
          : block.format === 'emom' || block.format === 'tabata'
            // Déjà en secondes : intervalle EMOM, travail Tabata.
            ? Number(block.timeCapSec) || undefined
            : undefined,
      // 0 est une valeur de repos légitime (le Tabata dégénère en EMOM), donc
      // `|| undefined` l'écraserait — d'où le test explicite sur la chaîne.
      restSec: block.format === 'tabata' && block.restSec.trim() !== '' ? Number(block.restSec) : undefined,
      targetRounds:
        block.format === 'emom' || block.format === 'for_time' || block.format === 'strength' || block.format === 'tabata'
          ? Number(block.targetRounds) || undefined
          : undefined,
      exercises,
    });
  }
  return out;
}
