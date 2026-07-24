import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

export type SupotsuClient = SupabaseClient<Database>;

/**
 * Storage adapter for auth token persistence. The mobile app injects
 * expo-secure-store; other clients (web, tests) can pass their own or omit it.
 * Kept as an interface so this package never depends on Expo.
 */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SupotsuClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage?: AuthStorage;
  /**
   * Auto-complete an OAuth session from the URL on load. Needed on web, where
   * the provider redirects the whole page back with a `?code=`; false on native
   * (the in-app browser flow exchanges the code explicitly).
   */
  detectSessionInUrl?: boolean;
}

/**
 * Single entry point for creating a Supabase client wired to Supotsu's schema.
 * Centralizing this keeps auth/storage configuration consistent across apps.
 */
export function createSupotsuClient(config: SupotsuClientConfig): SupotsuClient {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: config.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
    },
  });
}
