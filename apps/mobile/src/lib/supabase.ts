import * as SecureStore from 'expo-secure-store';
import { createSupotsuClient, type AuthStorage, type SupotsuClient } from '@supotsu/database';

/**
 * SecureStore-backed auth storage for the mobile client (Master Prompt P15/P29:
 * tokens kept in the platform secure store, never in plain storage).
 */
const secureStorage: AuthStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

let client: SupotsuClient | null = null;

/**
 * Lazily builds the Supabase client from public env vars. Returns null when
 * credentials are absent so the app still boots in Étape 1 (auth lands in É2).
 */
export function getSupabase(): SupotsuClient | null {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createSupotsuClient({
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    storage: secureStorage,
  });
  return client;
}
