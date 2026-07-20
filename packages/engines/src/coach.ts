import type { Activity, Confidence, HealthMetric, ISODateString } from '@supotsu/core';
import type { Explanation } from './result';
import { buildDailySnapshot, computeWorkload } from './scoring';

/**
 * Deterministic conversational coach (Master Prompt MVP P20.3 "IA v1", P6.3,
 * P25.10). It composes the scoring engines into explainable French replies —
 * no black box (P1). Designed behind this reply shape so a future LLM-backed
 * coach can implement the same contract.
 */

export type CoachIntent = 'today' | 'week' | 'fatigue' | 'plateau' | 'plan' | 'help';

export interface CoachReply {
  intent: CoachIntent;
  text: string;
  explanation?: Explanation;
  confidence: Confidence;
  followUps: string[];
}

export interface CoachContext {
  activities: Activity[];
  asOf: ISODateString;
  healthMetrics?: HealthMetric[];
}

const DAY_MS = 86_400_000;

function normalize(q: string): string {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const INTENT_KEYWORDS: Record<CoachIntent, string[]> = {
  today: ['aujourd', 'que faire', 'que dois', 'quoi faire', 'seance du jour', 'ma seance'],
  week: ['semaine', 'analyse', 'bilan', 'resume', 'mois', 'progression'],
  fatigue: ['fatigu', 'creve', 'epuise', 'repos', 'mal', 'douleur'],
  plateau: ['stagne', 'stagnation', 'progresse plus', 'plateau', 'bloque', 'pas de progres'],
  plan: ['programme', 'prepare', 'plan', 'entrainement pour', 'objectif'],
  help: [],
};

/** Best-effort intent classification from free-text (deterministic). */
export function detectIntent(question: string): CoachIntent {
  const q = normalize(question);
  for (const intent of ['today', 'fatigue', 'plateau', 'plan', 'week'] as CoachIntent[]) {
    if (INTENT_KEYWORDS[intent].some((k) => q.includes(k))) return intent;
  }
  return 'help';
}

/** Suggested canonical questions (Master Prompt P6.2, P25.10). */
export const SUGGESTED_QUESTIONS: string[] = [
  "Que dois-je faire aujourd'hui ?",
  'Analyse ma semaine',
  'Je suis fatigué',
  'Pourquoi je stagne ?',
  'Prépare-moi une séance',
];

function activeDays(activities: Activity[], asOf: ISODateString, days: number): number {
  const set = new Set<string>();
  for (const a of activities) {
    const age = (new Date(asOf).getTime() - new Date(a.startedAt).getTime()) / DAY_MS;
    if (age >= 0 && age < days) set.add(a.startedAt.slice(0, 10));
  }
  return set.size;
}

function confidenceFromSample(count: number): Confidence {
  if (count >= 4) return 'high';
  if (count >= 1) return 'medium';
  return 'to_confirm';
}

function answerToday(ctx: CoachContext): CoachReply {
  const snap = buildDailySnapshot(ctx.activities, [], ctx.asOf, ctx.healthMetrics ?? []);
  return {
    intent: 'today',
    text: snap.value.recommendation.explanation.action,
    explanation: snap.value.recommendation.explanation,
    confidence: snap.value.recommendation.confidence,
    followUps: ['Analyse ma semaine', 'Prépare-moi une séance'],
  };
}

function answerWeek(ctx: CoachContext): CoachReply {
  const recent = ctx.activities.filter(
    (a) => (new Date(ctx.asOf).getTime() - new Date(a.startedAt).getTime()) / DAY_MS < 7,
  );
  const days = activeDays(ctx.activities, ctx.asOf, 7);
  const totalMin = Math.round(recent.reduce((s, a) => s + a.durationSec, 0) / 60);
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);

  const text =
    recent.length === 0
      ? "Tu n'as aucune activité enregistrée cette semaine. Dès que tu en ajoutes, je peux analyser ta charge et ta régularité."
      : `Cette semaine : ${recent.length} activité(s) sur ${days} jour(s), ${totalMin} min au total. Ta charge est ${
          acwr > 1.5 ? 'en forte hausse' : acwr < 0.8 ? 'en baisse' : 'équilibrée'
        }.`;

  return {
    intent: 'week',
    text,
    confidence: confidenceFromSample(recent.length),
    followUps: ["Que dois-je faire aujourd'hui ?", 'Pourquoi je stagne ?'],
  };
}

function answerFatigue(ctx: CoachContext): CoachReply {
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);
  const explanation: Explanation = {
    observation: 'Tu signales de la fatigue aujourd’hui.',
    analysis:
      acwr > 1.3
        ? 'Ta charge récente est élevée, cette fatigue est cohérente.'
        : 'La récupération fait partie intégrante de la progression.',
    action: 'Privilégie aujourd’hui du repos ou une séance de mobilité légère.',
  };
  return {
    intent: 'fatigue',
    text: explanation.action,
    explanation,
    confidence: 'medium',
    followUps: ['Analyse ma semaine', "Que dois-je faire aujourd'hui ?"],
  };
}

function answerPlateau(ctx: CoachContext): CoachReply {
  const days = activeDays(ctx.activities, ctx.asOf, 28);
  const explanation: Explanation =
    days < 8
      ? {
          observation: `Tu es actif ${days} jour(s) sur les 4 dernières semaines.`,
          analysis: 'Une progression durable repose d’abord sur la régularité.',
          action: 'Vise 3 séances par semaine avant d’augmenter l’intensité.',
        }
      : {
          observation: 'Ta régularité est bonne mais tes performances stagnent.',
          analysis: 'Le corps s’adapte : sans nouvelle stimulation, la progression ralentit.',
          action: 'Varie tes exercices ou augmente légèrement la charge/le volume.',
        };
  return {
    intent: 'plateau',
    text: explanation.action,
    explanation,
    confidence: confidenceFromSample(ctx.activities.length),
    followUps: ['Prépare-moi une séance', 'Analyse ma semaine'],
  };
}

function answerPlan(ctx: CoachContext): CoachReply {
  const { acwr } = computeWorkload(ctx.activities, ctx.asOf);
  const focus =
    acwr > 1.5
      ? 'une séance de récupération (mobilité, marche, cardio léger)'
      : acwr < 0.8
        ? 'une séance plus intense pour relancer la charge'
        : 'une séance équilibrée dans la continuité de ton programme';
  const explanation: Explanation = {
    observation: `Ta charge actuelle donne un ratio aigu/chronique de ${acwr.toFixed(1)}.`,
    analysis: 'J’adapte la difficulté à ton état de charge du moment.',
    action: `Je te propose ${focus}.`,
  };
  return {
    intent: 'plan',
    text: explanation.action,
    explanation,
    confidence: confidenceFromSample(ctx.activities.length),
    followUps: ["Que dois-je faire aujourd'hui ?", 'Je suis fatigué'],
  };
}

function answerHelp(): CoachReply {
  return {
    intent: 'help',
    text: 'Je suis ton coach Supotsu. Je peux analyser ta semaine, te dire quoi faire aujourd’hui, adapter ta séance selon ta fatigue et t’aider si tu stagnes. Pose-moi une question ou choisis une suggestion.',
    confidence: 'high',
    followUps: SUGGESTED_QUESTIONS.slice(0, 3),
  };
}

/** Answer a free-text question using the user's data. Pure and deterministic. */
export function askCoach(question: string, ctx: CoachContext): CoachReply {
  switch (detectIntent(question)) {
    case 'today':
      return answerToday(ctx);
    case 'week':
      return answerWeek(ctx);
    case 'fatigue':
      return answerFatigue(ctx);
    case 'plateau':
      return answerPlateau(ctx);
    case 'plan':
      return answerPlan(ctx);
    default:
      return answerHelp();
  }
}
