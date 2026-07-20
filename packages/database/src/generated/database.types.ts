/**
 * Supabase schema types.
 *
 * Hand-written to mirror supabase/migrations/0001_init.sql until a live project
 * exists. Regenerate against a real stack with:
 *   pnpm db:types   (→ supabase gen types typescript --local)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          auth_provider: 'email' | 'apple' | 'google';
          status: 'active' | 'suspended' | 'deleted';
          units: 'metric' | 'imperial';
          locale: string;
          theme: 'system' | 'light' | 'dark';
          notifications_enabled: boolean;
          created_at: string;
          last_connection_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          auth_provider?: 'email' | 'apple' | 'google';
          units?: 'metric' | 'imperial';
          locale?: string;
          theme?: 'system' | 'light' | 'dark';
          notifications_enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      athlete_profiles: {
        Row: {
          user_id: string;
          birth_date: string | null;
          sex: 'male' | 'female' | 'unspecified';
          height_cm: number | null;
          weight_kg: number | null;
          level: 'beginner' | 'intermediate' | 'confirmed' | 'advanced';
          archetype: string | null;
          sports: string[];
          weekly_availability: number | null;
          equipment: string[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          birth_date?: string | null;
          sex?: 'male' | 'female' | 'unspecified';
          height_cm?: number | null;
          weight_kg?: number | null;
          level: 'beginner' | 'intermediate' | 'confirmed' | 'advanced';
          sports?: string[];
          weekly_availability?: number | null;
          equipment?: string[];
        };
        Update: Partial<Database['public']['Tables']['athlete_profiles']['Insert']>;
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          type: 'performance' | 'strength' | 'endurance' | 'body_composition' | 'health' | 'habit';
          title: string;
          description: string | null;
          priority: 'primary' | 'secondary';
          target_value: number | null;
          target_unit: string | null;
          current_value: number | null;
          deadline: string | null;
          status: 'active' | 'achieved' | 'paused' | 'abandoned';
          progress: number;
        } & Timestamps;
        Insert: {
          user_id: string;
          type: 'performance' | 'strength' | 'endurance' | 'body_composition' | 'health' | 'habit';
          title: string;
          description?: string | null;
          priority?: 'primary' | 'secondary';
          target_value?: number | null;
          target_unit?: string | null;
          deadline?: string | null;
        };
        Update: Partial<Database['public']['Tables']['goals']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
