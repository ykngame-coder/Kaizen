/**
 * Placeholder Supabase types.
 *
 * Regenerate against the local stack with:
 *   pnpm db:types   (→ supabase gen types typescript --local)
 *
 * Kept minimal so the typed client compiles before the local DB exists.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
