/**
 * Ambient typing for the public env vars Expo inlines at build time
 * (EXPO_PUBLIC_*). Scoped here to avoid pulling all of @types/node.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  };
};
