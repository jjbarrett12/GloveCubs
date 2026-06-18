import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ReviewFetchWarning } from "@/lib/admin/review-fetch-errors";
import { sanitizeReviewFetchMessage } from "@/lib/admin/review-fetch-errors";

export type AdminCategoryOption = { id: string; name: string; slug: string | null };

function categoriesFetchError(message: string, code?: string | null): ReviewFetchWarning {
  return {
    area: "categories",
    code: code?.trim() || "query_failed",
    message: sanitizeReviewFetchMessage(message),
  };
}

export async function fetchAdminCategoriesForProductForm(): Promise<{
  rows: AdminCategoryOption[];
  error: ReviewFetchWarning | null;
}> {
  if (!isSupabaseConfigured()) return { rows: [], error: null };
  let supabase: any;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review data could not be loaded.";
    return { rows: [], error: categoriesFetchError(message) };
  }
  const { data, error } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("id, name, slug")
    .order("name", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[admin categories]", error.message);
    return { rows: [], error: categoriesFetchError(error.message, error.code) };
  }
  return { rows: (data ?? []) as AdminCategoryOption[], error: null };
}
