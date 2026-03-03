import { z } from "zod";

export const chemicalResistanceSchema = z.record(
  z.enum(["acids", "bases", "solvents", "oils", "disinfectants"]),
  z.enum(["low", "med", "high"])
);

export const gloveProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  glove_type: z.enum(["disposable", "reusable"]),
  material: z.string().nullable(),
  thickness_mil: z.number().nullable(),
  cut_level: z.string().nullable(),
  impact_rating: z.boolean(),
  chemical_resistance: z.record(z.string(), z.string()).default({}),
  heat_resistance_c: z.number().nullable(),
  cold_rating: z.string().nullable(),
  grip: z.string().nullable(),
  lining: z.string().nullable(),
  coating: z.string().nullable(),
  waterproof: z.boolean(),
  food_safe: z.boolean(),
  medical_grade: z.boolean(),
  chemo_rated: z.boolean(),
  powder_free: z.boolean(),
  sterile: z.boolean(),
  cuff_length_mm: z.number().nullable(),
  durability_score: z.number(),
  dexterity_score: z.number(),
  protection_score: z.number(),
  price_cents: z.number(),
  image_url: z.string().nullable(),
  active: z.boolean(),
  created_at: z.string().optional(),
});

export type GloveProduct = z.infer<typeof gloveProductSchema>;

export const useCaseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  sort: z.number(),
});

export type GloveUseCase = z.infer<typeof useCaseSchema>;

export const riskProfileSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  weights: z.record(z.string(), z.number()),
});

export type GloveRiskProfile = z.infer<typeof riskProfileSchema>;

export const useCaseRiskSchema = z.object({
  use_case_id: z.string().uuid(),
  risk_profile_id: z.string().uuid(),
  severity: z.number().min(1).max(3),
});

export type GloveUseCaseRisk = z.infer<typeof useCaseRiskSchema>;

// Wizard answers
export const recommendAnswersSchema = z.object({
  gloveTypePreference: z.enum(["disposable", "reusable", "either"]).default("either"),
  chemicalsLevel: z.enum(["none", "low", "med", "high"]).default("none"),
  chemicalsType: z.array(z.enum(["disinfectants", "solvents", "oils"])).default([]),
  cutAbrasionLevel: z.enum(["none", "low", "med", "high"]).default("none"),
  biohazard: z.boolean().default(false),
  foodContact: z.boolean().default(false),
  coldEnvironment: z.boolean().default(false),
  dexterityImportance: z.enum(["low", "med", "high"]).default("med"),
  budgetSensitivity: z.enum(["lowest_price", "balanced", "best_protection"]).default("balanced"),
  quantity: z.enum(["single_box", "cases", "ongoing_reorder"]).default("single_box"),
});

export type RecommendAnswers = z.infer<typeof recommendAnswersSchema>;

export const recommendRequestSchema = z.object({
  useCaseKey: z.string().min(1),
  answers: recommendAnswersSchema,
});

export type RecommendRequest = z.infer<typeof recommendRequestSchema>;

export const singleRecoSchema = z.object({
  sku: z.string(),
  score_0_100: z.number().min(0).max(100),
  reason: z.string(),
  best_for: z.string().optional(),
  tradeoffs: z.string().optional(),
  name: z.string().optional(),
  price_cents: z.number().optional(),
  glove_type: z.enum(["disposable", "reusable"]).optional(),
});

export const recommendResponseSchema = z.object({
  recommendations: z.array(singleRecoSchema),
  alternatives: z
    .array(
      z.object({
        type: z.enum(["cheaper", "more_durable", "more_protection"]),
        skus: z.array(z.string()),
      })
    )
    .optional(),
  clarifying_questions: z.array(z.string()).optional(),
  confidence_0_1: z.number().min(0).max(1),
  model_used: z.enum(["openai", "rules"]).optional(),
  score_breakdown: z
    .array(
      z.object({
        sku: z.string(),
        total: z.number(),
        breakdown: z.record(z.string(), z.number()).optional(),
      })
    )
    .optional(),
});

export type RecommendResponse = z.infer<typeof recommendResponseSchema>;
