import { EXERCISE_LIBRARY } from '@supotsu/shared';

/**
 * Screenshot-to-workout import (Master Prompt — "aucune boîte noire"): OCR
 * text in, a structured draft out, nothing ever saved without the user
 * reviewing it on the review screen. This module is the pure middle step —
 * text parsing + catalog matching — with no I/O, no OCR call, no image
 * handling; those live in apps/mobile/src/features/connectors/ocrClient.ts.
 * Same shape as healthAutoExport.ts: small pure functions, Vitest-covered.
 */

export interface ParsedSet {
  reps?: number;
  weightKg?: number;
}

export interface ParsedExercise {
  rawName: string;
  sets: ParsedSet[];
  confidence: 'high' | 'medium' | 'to_confirm';
  /** Sets sharing this number were tagged as a Hevy superset — same meaning as SetEntry.supersetGroup once saved. */
  supersetGroup?: number;
}

export interface ParsedWorkout {
  name?: string;
  exercises: ParsedExercise[];
}

const MULT = '[x×X*✕]';
const UNIT = 'kg|kgs|lb|lbs|livres';
const LB_TO_KG = 0.453592;

function toKg(value: number, unit?: string): number {
  return (unit ?? '').toLowerCase().startsWith('lb') ? Math.round(value * LB_TO_KG * 10) / 10 : value;
}

function parseNum(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Strips a leading superset/numbering marker: "A1.", "2)", "-", "•". */
function stripPrefix(line: string): string {
  return line.replace(/^\s*(?:[A-Za-z]\d*[.):]|\d+[.):]|[-•*])\s*/, '').trim();
}

interface LineMatch {
  name: string;
  sets: number;
  reps?: number;
  weightKg?: number;
  confidence: 'high' | 'medium';
}

// "Name 4×8 60kg" / "Name 4x8 @60kg" / "Name 4x8 (12kg)" — sets × reps, weight optional (bodyweight).
const PATTERN_SETS_FIRST = new RegExp(
  `^(.*?)\\s*(\\d+)\\s*${MULT}\\s*(\\d+)(?:\\s*[@(]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\)?)?\\s*$`,
  'i',
);
// "Name 100 kg x5" — weight stated before reps; implies a single set.
const PATTERN_WEIGHT_FIRST = new RegExp(`^(.*?)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\s*${MULT}\\s*(\\d+)\\s*$`, 'i');
// "Name 45" / "Name 60kg" — a single bare number, no × sign: could be reps or weight, genuinely ambiguous.
const PATTERN_AMBIGUOUS = new RegExp(`^(.*?)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\s*$`, 'i');
// Garmin: "8 répét. • 45,0 kg" — reps first, then weight, joined by a middle dot. Always a continuation (Garmin's exercise name is its own preceding line).
const PATTERN_GARMIN_REPS_WEIGHT = new RegExp(`^(\\d+)\\s*répét\\.?\\s*[•·]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\s*$`, 'i');

/** Exact-match chrome from Garmin Connect and Hevy screenshots — never exercise data. */
const NOISE_LINES = new Set([
  'Les exercices physiques',
  'Échauffement',
  'Étapes',
  'Repos',
  'Appui sur touche Lap',
  'SÉRIE',
  'POIDS ET RÉPÉTITIONS',
  "Détails de l'Entraînement",
  "Modifier l'Entraînement",
  'Voir plus',
  'Entraînement',
  'Accueil',
  'Profil',
  'HEVY',
  'Poids',
  '1RM',
]);
// Garmin's "3 sessions" / "1 série" repeat-count headers.
const GROUP_COUNT_LINE = /^\d+\s+(sessions?|séries?)$/i;
// A bare clock/duration value: status-bar clock, Garmin rest, or a cardio
// block's duration. Also fixes a real bug: "2:30" used to false-match the
// ambiguous pattern as name="2:", reps=30.
const BARE_CLOCK_LINE = /^\d{1,2}:\d{2}$/;
// Hevy's set-index/marker column ("1", "2", "W" for warm-up).
const BARE_MARKER_LINE = /^(?:[A-Za-z]{1,2}|\d{1,3})$/;

function isNoiseLine(line: string): boolean {
  if (NOISE_LINES.has(line)) return true;
  if (GROUP_COUNT_LINE.test(line)) return true;
  if (BARE_CLOCK_LINE.test(line)) return true;
  // Long, digit-free paragraph — safety net for footer disclaimers.
  if (line.length > 80 && !/\d/.test(line)) return true;
  return false;
}

/** True if `line` already carries both reps and weight on its own (no name needed). */
function isFullySelfContained(line: string): boolean {
  if (PATTERN_WEIGHT_FIRST.test(line)) return true;
  const m = PATTERN_SETS_FIRST.exec(line);
  return m != null && m[4] != null;
}

/**
 * Strips prefixes, drops chrome noise, collapses consecutive duplicate
 * lines (Hevy's scroll-ghosting artifact), and drops a bare set-index/marker
 * line when the very next line already fully explains itself (Hevy's
 * two-column set table) — without touching a bare number that legitimately
 * stands alone as a rep count.
 */
function preprocessLines(raw: string[]): string[] {
  // Noise-check first, on the untouched line: stripPrefix's numbered-list
  // marker removal (e.g. "2." / "2)") also matches "2:" at the start of a
  // clock/duration value like "2:30" — checking noise beforehand keeps that
  // value intact for BARE_CLOCK_LINE to actually catch.
  const stripped = raw
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isNoiseLine(l))
    .map((l) => stripPrefix(l))
    .filter((l) => l.length > 0);
  const deduped: string[] = [];
  for (const l of stripped) {
    if (deduped.length > 0 && deduped[deduped.length - 1]!.toLowerCase() === l.toLowerCase()) continue;
    deduped.push(l);
  }
  const out: string[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const line = deduped[i]!;
    const next = deduped[i + 1];
    if (BARE_MARKER_LINE.test(line) && next && isFullySelfContained(next)) continue;
    out.push(line);
  }
  return out;
}

function matchLine(line: string): LineMatch | null {
  let m = PATTERN_WEIGHT_FIRST.exec(line);
  if (m) {
    const [, name, weightStr, unit, repsStr] = m;
    return { name: name!.trim(), sets: 1, reps: parseNum(repsStr!), weightKg: toKg(parseNum(weightStr!), unit), confidence: 'high' };
  }
  m = PATTERN_SETS_FIRST.exec(line);
  if (m) {
    const [, name, setsStr, repsStr, weightStr, unit] = m;
    return {
      name: name!.trim(),
      sets: Math.max(1, parseNum(setsStr!)),
      reps: parseNum(repsStr!),
      weightKg: weightStr ? toKg(parseNum(weightStr), unit) : undefined,
      confidence: 'high',
    };
  }
  m = PATTERN_GARMIN_REPS_WEIGHT.exec(line);
  if (m) {
    const [, repsStr, weightStr, unit] = m;
    return { name: '', sets: 1, reps: parseNum(repsStr!), weightKg: toKg(parseNum(weightStr!), unit), confidence: 'high' };
  }
  m = PATTERN_AMBIGUOUS.exec(line);
  if (m) {
    const [, name, numStr, unit] = m;
    const value = parseNum(numStr!);
    return unit
      ? { name: name!.trim(), sets: 1, weightKg: toKg(value, unit), confidence: 'medium' }
      : { name: name!.trim(), sets: 1, reps: value, confidence: 'medium' };
  }
  return null;
}

const CONFIDENCE_RANK: Record<ParsedExercise['confidence'], number> = { to_confirm: 0, medium: 1, high: 2 };
const worseOf = (a: ParsedExercise['confidence'], b: ParsedExercise['confidence']): ParsedExercise['confidence'] =>
  CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a;

/**
 * Parse raw OCR text (one line ≈ one exercise, or one exercise name followed
 * by its set lines) into a draft workout. Never throws, never drops a line —
 * anything unparseable becomes a `to_confirm` exercise with no sets rather
 * than silently vanishing, so the review screen always has something to
 * show for every line the OCR produced.
 */
export function parseWorkoutText(rawText: string): ParsedWorkout {
  const lines = preprocessLines(rawText.split(/\r?\n/));
  if (lines.length === 0) return { exercises: [] };

  // A first line with no digits at all *usually* reads as the session title
  // ("Push Day", "Séance Jambes") rather than an exercise. But a bare
  // exercise name on its own line, with its sets on the *next* line, also
  // has no digits — distinguish the two by checking whether line 2 is a
  // nameless "sets only" continuation (in which case line 1 must be the
  // exercise it continues, not a title) — and never swallow the only line
  // of input as a title, or a lone unparseable line would silently vanish
  // instead of surfacing as a to_confirm row.
  let name: string | undefined;
  let rest = lines;
  if (lines.length > 1 && !/\d/.test(lines[0]!)) {
    const secondMatch = matchLine(lines[1]!);
    const secondIsBareContinuation = secondMatch !== null && secondMatch.name === '';
    if (!secondIsBareContinuation) {
      name = lines[0];
      rest = lines.slice(1);
    }
  }

  const exercises: ParsedExercise[] = [];
  let pendingSuperset = false;
  let nextGroupId = 1;
  const tagSuperset = (newEx: ParsedExercise): void => {
    const prev = exercises.at(-1);
    const group = prev?.supersetGroup ?? nextGroupId++;
    if (prev && prev.supersetGroup == null) prev.supersetGroup = group;
    newEx.supersetGroup = group;
  };
  for (const line of rest) {
    if (line === 'Superset') {
      pendingSuperset = true;
      continue;
    }
    const match = matchLine(line);
    if (!match) {
      const newEx: ParsedExercise = { rawName: line, sets: [], confidence: 'to_confirm' };
      if (pendingSuperset) tagSuperset(newEx);
      pendingSuperset = false;
      exercises.push(newEx);
      continue;
    }
    const newSets: ParsedSet[] = Array.from({ length: match.sets }, () => ({ reps: match.reps, weightKg: match.weightKg }));
    if (match.name) {
      const newEx: ParsedExercise = { rawName: match.name, sets: newSets, confidence: match.confidence };
      if (pendingSuperset) tagSuperset(newEx);
      pendingSuperset = false;
      exercises.push(newEx);
    } else {
      // No name captured — a continuation line (extra sets logged on their
      // own row) belonging to the exercise just above it. If `last` is
      // still an empty placeholder (e.g. a bare name line awaiting its
      // sets), its confidence is not real data yet — adopt the
      // continuation's confidence outright instead of blending, so the
      // placeholder's pessimistic 'to_confirm' can't poison a legitimate
      // high-confidence match that arrives right after it.
      const last = exercises.at(-1);
      if (!last) continue;
      const hadSets = last.sets.length > 0;
      last.sets.push(...newSets);
      last.confidence = hadSets ? worseOf(last.confidence, match.confidence) : match.confidence;
    }
  }

  for (const ex of exercises) {
    if (ex.sets.length === 0) ex.confidence = 'to_confirm';
  }

  return { name, exercises };
}

export interface ExerciseMatch {
  exerciseId?: string;
  matchName?: string;
  score: number;
}

const MATCH_THRESHOLD = 0.55;

/** Common English/abbreviated gym terms that share little text with their French catalog entry — bridged by hand since bigram similarity alone won't connect e.g. "bench" to "Développé couché". */
const ALIASES: [RegExp, string][] = [
  [/\bbench\b/, 'développé couché'],
  [/\bdev\b/, 'développé'],
  [/\bdeadlift\b/, 'soulevé de terre'],
  [/\bpull.?up\b/, 'traction'],
  [/\bpush.?up\b/, 'pompes'],
  [/\bshoulder press\b/, 'développé militaire'],
  [/\boverhead press\b/, 'développé militaire'],
  [/\bswing\b/, 'kettlebell swing'],
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAliases(s: string): string {
  let out = s;
  for (const [pattern, replacement] of ALIASES) {
    if (pattern.test(out)) out = `${out} ${replacement}`;
  }
  return out;
}

/** Bigram (Dice coefficient) similarity, 0-1 — tolerant of abbreviation, word order and small OCR typos without needing a full edit-distance pass. */
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let intersection = 0;
  for (const [bg, count] of bgA) intersection += Math.min(count, bgB.get(bg) ?? 0);
  const total = [...bgA.values()].reduce((s, c) => s + c, 0) + [...bgB.values()].reduce((s, c) => s + c, 0);
  return total === 0 ? 0 : (2 * intersection) / total;
}

/**
 * Fuzzy-match an OCR'd exercise name against EXERCISE_LIBRARY (the same
 * catalog `workout_sets.exercise_id` FKs to). Below `MATCH_THRESHOLD`, no
 * exerciseId/matchName is returned — the review screen must let the user
 * pick or create the exercise by hand rather than guess wrong.
 */
export function resolveExerciseByName(rawName: string): ExerciseMatch {
  const target = normalize(expandAliases(rawName));
  if (!target) return { score: 0 };

  let best: ExerciseMatch = { score: 0 };
  for (const ex of EXERCISE_LIBRARY) {
    const score = diceSimilarity(target, normalize(ex.name));
    if (score > best.score) best = { exerciseId: ex.id, matchName: ex.name, score };
  }
  return best.score >= MATCH_THRESHOLD ? best : { score: best.score };
}
