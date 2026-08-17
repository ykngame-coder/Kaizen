import { ensureProfile, getAthleteProfile, upsertAthleteProfile, insertGoal } from '@supotsu/database';
import type { AthleteProfileInput, GoalInput } from '@supotsu/shared';
import { secureStorage } from '@/lib/secure-storage';
import { getSupabase } from '@/lib/supabase';

export interface OnboardingData {
  profile: AthleteProfileInput;
  goal: GoalInput;
}

/**
 * Reads/writes onboarding completion. Supabase mode uses the presence of an
 * athlete_profile row; demo mode uses a per-user SecureStore flag.
 */
export interface ProfileStore {
  isOnboarded(userId: string): Promise<boolean>;
  completeOnboarding(userId: string, email: string, data: OnboardingData): Promise<void>;
}

const demoKey = (userId: string): string => `supotsu.onboarded.${userId}`;

function createDemoStore(): ProfileStore {
  return {
    async isOnboarded(userId) {
      return (await secureStorage.getItem(demoKey(userId))) === '1';
    },
    async completeOnboarding(userId) {
      await secureStorage.setItem(demoKey(userId), '1');
    },
  };
}

function createSupabaseStore(client: NonNullable<ReturnType<typeof getSupabase>>): ProfileStore {
  return {
    async isOnboarded(userId) {
      return (await getAthleteProfile(client, userId)) !== null;
    },
    async completeOnboarding(userId, email, data) {
      // Normally already provisioned by the on_auth_user_created trigger —
      // this is a self-healing fallback for the accounts where it didn't
      // fire (athlete_profiles/goals both FK to profiles, so without this
      // both inserts below fail).
      await ensureProfile(client, userId, email);
      await upsertAthleteProfile(client, {
        user_id: userId,
        sex: data.profile.sex,
        height_cm: data.profile.heightCm ?? null,
        weight_kg: data.profile.weightKg ?? null,
        level: data.profile.level,
        sports: data.profile.sports,
        weekly_availability: data.profile.weeklyAvailability ?? null,
        equipment: data.profile.equipment,
      });
      await insertGoal(client, {
        user_id: userId,
        type: data.goal.type,
        title: data.goal.title,
        description: data.goal.description ?? null,
        priority: data.goal.priority,
        target_value: data.goal.targetValue ?? null,
        target_unit: data.goal.targetUnit ?? null,
        deadline: data.goal.deadline ?? null,
      });
    },
  };
}

export function createProfileStore(): ProfileStore {
  const client = getSupabase();
  return client ? createSupabaseStore(client) : createDemoStore();
}
