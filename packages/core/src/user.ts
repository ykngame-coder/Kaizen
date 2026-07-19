import type { ISODateString, UUID } from './common';

export type AuthProvider = 'email' | 'apple' | 'google';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type MeasurementSystem = 'metric' | 'imperial';

/** Account identity (mirrors Supabase `auth.users` + our `profiles` row). */
export interface User {
  id: UUID;
  email: string;
  authProvider: AuthProvider;
  status: AccountStatus;
  createdAt: ISODateString;
  lastConnectionAt?: ISODateString;
  preferences: UserPreferences;
}

export interface UserPreferences {
  units: MeasurementSystem;
  locale: string;
  theme: 'system' | 'light' | 'dark';
  notificationsEnabled: boolean;
}

export type SportLevel = 'beginner' | 'intermediate' | 'confirmed' | 'advanced';
export type Sex = 'male' | 'female' | 'unspecified';

/** Dominant sport archetype, derived by engines over time (Master Prompt P5.1). */
export type AthleteArchetype =
  'endurance' | 'power' | 'hybrid' | 'strength' | 'mobility' | 'beginner';

/** Evolving sport profile (Master Prompt P5, P8.4, P18.2). */
export interface AthleteProfile {
  userId: UUID;
  birthDate?: ISODateString;
  sex: Sex;
  heightCm?: number;
  weightKg?: number;
  level: SportLevel;
  archetype?: AthleteArchetype;
  sports: string[];
  weeklyAvailability?: number; // sessions/week the user can commit to
  equipment: string[];
  updatedAt: ISODateString;
}
