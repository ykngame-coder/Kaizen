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
      activities: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          source: string;
          started_at: string;
          duration_sec: number;
          distance_m: number | null;
          calories: number | null;
          intensity: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate: number | null;
          max_heart_rate: number | null;
          elevation_gain_m: number | null;
          raw: Json | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          type: string;
          source?: string;
          started_at: string;
          duration_sec: number;
          distance_m?: number | null;
          calories?: number | null;
          intensity?: 'low' | 'moderate' | 'high' | 'max' | null;
          avg_heart_rate?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          name: string;
          status: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for: string | null;
          completed_at: string | null;
          duration_sec: number | null;
          rpe: number | null;
          notes: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          name: string;
          status?: 'planned' | 'in_progress' | 'completed' | 'skipped';
          planned_for?: string | null;
          completed_at?: string | null;
          duration_sec?: number | null;
          rpe?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
        Relationships: [];
      };
      workout_sets: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          order: number;
          reps: number | null;
          weight_kg: number | null;
          duration_sec: number | null;
          rest_sec: number | null;
          rpe: number | null;
        };
        Insert: {
          workout_id: string;
          exercise_id: string;
          order?: number;
          reps?: number | null;
          weight_kg?: number | null;
          duration_sec?: number | null;
          rest_sec?: number | null;
          rpe?: number | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>;
        Relationships: [];
      };
      health_metrics: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          value: number;
          unit: string;
          source: string;
          reliability: 'high' | 'medium' | 'low' | null;
          measured_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: string;
          value: number;
          unit: string;
          source?: string;
          reliability?: 'high' | 'medium' | 'low' | null;
          measured_at: string;
        };
        Update: Partial<Database['public']['Tables']['health_metrics']['Insert']>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          category: string;
          primary_muscles: string[];
          secondary_muscles: string[];
          equipment: string[];
          level: 'beginner' | 'intermediate' | 'advanced';
          instructions: string | null;
          common_mistakes: string[];
          variants: string[];
          media_url: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          category: string;
          primary_muscles?: string[];
          level?: 'beginner' | 'intermediate' | 'advanced';
        };
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>;
        Relationships: [];
      };
      nutrition_entries: {
        Row: {
          id: string;
          user_id: string;
          meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          description: string;
          kcal: number;
          protein_g: number | null;
          carb_g: number | null;
          fat_g: number | null;
          hydration_ml: number | null;
          source: string;
          logged_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          description: string;
          kcal: number;
          protein_g?: number | null;
          carb_g?: number | null;
          fat_g?: number | null;
          hydration_ml?: number | null;
          source?: string;
          logged_at: string;
        };
        Update: Partial<Database['public']['Tables']['nutrition_entries']['Insert']>;
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          pillar: string;
          cadence: 'daily' | 'weekly';
          target_per_period: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          pillar?: string;
          cadence?: 'daily' | 'weekly';
          target_per_period?: number;
          archived_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['habits']['Insert']>;
        Relationships: [];
      };
      habit_logs: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          habit_id: string;
          completed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['habit_logs']['Insert']>;
        Relationships: [];
      };
      earned_badges: {
        Row: {
          id: string;
          user_id: string;
          badge_id: string;
          reason: string;
          earned_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          badge_id: string;
          reason: string;
          earned_at?: string;
        };
        Update: Partial<Database['public']['Tables']['earned_badges']['Insert']>;
        Relationships: [];
      };
      challenges: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          metric: 'activity_count' | 'active_days';
          target: number;
          starts_at: string;
          ends_at: string;
          visibility: 'public' | 'private';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title: string;
          description?: string | null;
          metric?: 'activity_count' | 'active_days';
          target: number;
          starts_at: string;
          ends_at: string;
          visibility?: 'public' | 'private';
        };
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
        Relationships: [];
      };
      challenge_participants: {
        Row: {
          id: string;
          user_id: string;
          challenge_id: string;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          challenge_id: string;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['challenge_participants']['Insert']>;
        Relationships: [];
      };
      programs: {
        Row: {
          id: string;
          title: string;
          author: string;
          focus: 'strength' | 'endurance' | 'hyrox' | 'weight_loss' | 'mobility' | 'general';
          level: 'beginner' | 'intermediate' | 'confirmed' | 'advanced';
          weeks: number;
          sessions_per_week: number;
          description: string;
          price_cents: number;
        };
        Insert: {
          id: string;
          title: string;
          author: string;
          focus: 'strength' | 'endurance' | 'hyrox' | 'weight_loss' | 'mobility' | 'general';
          level: 'beginner' | 'intermediate' | 'confirmed' | 'advanced';
          weeks: number;
          sessions_per_week: number;
          description?: string;
          price_cents?: number;
        };
        Update: Partial<Database['public']['Tables']['programs']['Insert']>;
        Relationships: [];
      };
      program_enrollments: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          status: 'active' | 'completed' | 'abandoned';
          started_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          program_id: string;
          status?: 'active' | 'completed' | 'abandoned';
          started_at?: string;
        };
        Update: Partial<Database['public']['Tables']['program_enrollments']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      challenge_leaderboard: {
        Args: { p_challenge: string };
        Returns: { user_id: string; progress: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
