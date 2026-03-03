export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      glove_products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          glove_type: "disposable" | "reusable";
          material: string | null;
          thickness_mil: number | null;
          cut_level: string | null;
          impact_rating: boolean;
          chemical_resistance: Json;
          heat_resistance_c: number | null;
          cold_rating: string | null;
          grip: string | null;
          lining: string | null;
          coating: string | null;
          waterproof: boolean;
          food_safe: boolean;
          medical_grade: boolean;
          chemo_rated: boolean;
          powder_free: boolean;
          sterile: boolean;
          cuff_length_mm: number | null;
          durability_score: number;
          dexterity_score: number;
          protection_score: number;
          price_cents: number;
          image_url: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["glove_products"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["glove_products"]["Insert"]>;
      };
      glove_use_cases: {
        Row: {
          id: string;
          key: string;
          label: string;
          description: string | null;
          icon: string | null;
          sort: number;
        };
        Insert: Omit<Database["public"]["Tables"]["glove_use_cases"]["Row"], "id"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["glove_use_cases"]["Insert"]>;
      };
      glove_risk_profiles: {
        Row: {
          id: string;
          key: string;
          label: string;
          description: string | null;
          weights: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["glove_risk_profiles"]["Row"], "id"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["glove_risk_profiles"]["Insert"]>;
      };
      glove_use_case_risks: {
        Row: {
          use_case_id: string;
          risk_profile_id: string;
          severity: number;
        };
        Insert: Database["public"]["Tables"]["glove_use_case_risks"]["Row"];
        Update: Partial<Database["public"]["Tables"]["glove_use_case_risks"]["Insert"]>;
      };
      glove_reco_sessions: {
        Row: {
          id: string;
          created_at: string;
          use_case_key: string | null;
          answers: Json | null;
          result: Json | null;
          model_used: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["glove_reco_sessions"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["glove_reco_sessions"]["Insert"]>;
      };
      ai_events: {
        Row: {
          id: number;
          created_at: string;
          event_type: string;
          model_used: string | null;
          tokens_estimate: number | null;
          success: boolean;
          latency_ms: number | null;
          meta: Json | null;
        };
        Insert: {
          event_type: string;
          model_used?: string | null;
          tokens_estimate?: number | null;
          success?: boolean;
          latency_ms?: number | null;
          meta?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_events"]["Insert"]>;
      };
    };
  };
}
