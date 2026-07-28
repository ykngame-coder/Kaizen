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

/** Static image assets bundled by Metro resolve to an opaque asset id. */
declare module '*.png' {
  const asset: number;
  export default asset;
}
