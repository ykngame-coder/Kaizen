import 'react-native-url-polyfill/auto';
import { createSupotsuClient, type SupotsuClient } from '@supotsu/database';
import { secureStorage } from '@/lib/secure-storage';

// Tokens live in the platform secure store on native, localStorage on web
// (Master Prompt P15/P29). See lib/secure-storage.ts.

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
