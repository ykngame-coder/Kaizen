import type { ISODateString, UUID } from '@supotsu/core';

/**
 * Domain event catalog (Master Prompt P16.6, P23.9). Modules emit these instead
 * of calling each other directly; engines subscribe. A discriminated union keeps
 * handlers type-safe.
 */

export interface DomainEventBase {
  id: UUID;
  userId: UUID;
  occurredAt: ISODateString;
}

export interface WorkoutCompletedEvent extends DomainEventBase {
  type: 'WorkoutCompleted';
  workoutId: UUID;
}

export interface SleepRecordedEvent extends DomainEventBase {
  type: 'SleepRecorded';
  durationSec: number;
}

export interface WeightUpdatedEvent extends DomainEventBase {
  type: 'WeightUpdated';
  weightKg: number;
}

export interface GoalReachedEvent extends DomainEventBase {
  type: 'GoalReached';
  goalId: UUID;
}

export interface NewRecordEvent extends DomainEventBase {
  type: 'NewRecord';
  exerciseId?: UUID;
  label: string;
}

export interface DeviceSyncedEvent extends DomainEventBase {
  type: 'DeviceSynced';
  source: string;
}

export interface MealLoggedEvent extends DomainEventBase {
  type: 'MealLogged';
  entryId: UUID;
  kcal: number;
}

export interface HabitCompletedEvent extends DomainEventBase {
  type: 'HabitCompleted';
  habitId: UUID;
}

export interface BadgeEarnedEvent extends DomainEventBase {
  type: 'BadgeEarned';
  badgeId: string;
}

export type DomainEvent =
  | WorkoutCompletedEvent
  | SleepRecordedEvent
  | WeightUpdatedEvent
  | GoalReachedEvent
  | NewRecordEvent
  | DeviceSyncedEvent
  | MealLoggedEvent
  | HabitCompletedEvent
  | BadgeEarnedEvent;

export type DomainEventType = DomainEvent['type'];
