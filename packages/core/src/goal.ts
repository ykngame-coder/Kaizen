import type { ISODateString, OwnedEntity } from './common';

export type GoalType =
  'performance' | 'strength' | 'endurance' | 'body_composition' | 'health' | 'habit';

export type GoalStatus = 'active' | 'achieved' | 'paused' | 'abandoned';
export type GoalPriority = 'primary' | 'secondary';

/** A measurable objective (Master Prompt P3 module Objectifs, P32.5, P51.6). */
export interface Goal extends OwnedEntity {
  type: GoalType;
  title: string;
  description?: string;
  priority: GoalPriority;
  targetValue?: number;
  targetUnit?: string;
  /** Baseline captured when the goal was created (for progress vs target). */
  startValue?: number;
  currentValue?: number;
  deadline?: ISODateString;
  status: GoalStatus;
  /** 0-1 progress, computed by engines. */
  progress: number;
}
