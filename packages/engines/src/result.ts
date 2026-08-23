import type { Confidence, DataSource, ISODateString, Pillar } from '@supotsu/core';

/**
 * A translation key + its interpolation values — engines stay pure/UI-free by
 * naming *what* to say instead of writing it out; the UI resolves the key via
 * i18next (t(key, params)). Never a literal sentence (Master Prompt: multilingual,
 * i18n-ready).
 */
export interface I18nText {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * The mandatory explanation shape for any meaningful recommendation
 * (Master Prompt P18.9: Observation → Analyse → Action).
 */
export interface Explanation {
  observation: I18nText;
  analysis: I18nText;
  action: I18nText;
}

/**
 * Uniform envelope every engine returns. Carries confidence, the human-readable
 * explanation and which data sources fed the result — never a bare number
 * (Master Prompt P1 philosophy, P21.15 transparency).
 */
export interface EngineResult<T> {
  value: T;
  confidence: Confidence;
  explanation?: Explanation;
  sourcesUsed: DataSource[];
  generatedAt: ISODateString;
}

/** Everything an engine needs to run, without touching persistence or UI. */
export interface EngineContext {
  userId: string;
  /** Point in time the computation is anchored to (defaults to now upstream). */
  asOf: ISODateString;
}

/** A single actionable recommendation surfaced to the user. */
export interface Recommendation {
  pillar: Pillar;
  title: I18nText;
  explanation: Explanation;
  confidence: Confidence;
}
