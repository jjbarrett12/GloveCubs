import { listClipboardStaging, type ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import {
  fetchUnifiedReviewQueue,
  type UnifiedReviewQueueRow,
} from "@/lib/admin/unified-ingestion-review-queue";
import {
  fetchAdminCategoriesForProductForm,
  type AdminCategoryOption,
} from "@/lib/admin/product-form-options";
import {
  classifyReviewFetchError,
  type ReviewFetchWarning,
} from "@/lib/admin/review-fetch-errors";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export type { ReviewFetchArea, ReviewFetchWarning } from "@/lib/admin/review-fetch-errors";
export { classifyReviewFetchError, sanitizeReviewFetchMessage } from "@/lib/admin/review-fetch-errors";

export type ReviewPageLoadResult = {
  unifiedRows: UnifiedReviewQueueRow[];
  clipboardRows: ClipboardStagingRow[];
  categories: AdminCategoryOption[];
  warnings: ReviewFetchWarning[];
  queueError: ReviewFetchWarning | null;
};

async function loadCategoriesSafe(): Promise<{ rows: AdminCategoryOption[]; warning: ReviewFetchWarning | null }> {
  try {
    const result = await fetchAdminCategoriesForProductForm();
    if (result.error) {
      console.error("[review-page] categories", result.error.code, result.error.message);
      return { rows: result.rows, warning: result.error };
    }
    return { rows: result.rows, warning: null };
  } catch (err) {
    const warning = classifyReviewFetchError("categories", err);
    console.error("[review-page] categories", warning.code, warning.message);
    return { rows: [], warning };
  }
}

export async function loadAdminProductsReviewPageData(input: {
  useUnifiedQueue: boolean;
}): Promise<ReviewPageLoadResult> {
  const empty: ReviewPageLoadResult = {
    unifiedRows: [],
    clipboardRows: [],
    categories: [],
    warnings: [],
    queueError: null,
  };

  if (!isSupabaseConfigured()) return empty;

  const warnings: ReviewFetchWarning[] = [];
  let queueError: ReviewFetchWarning | null = null;

  try {
    if (input.useUnifiedQueue) {
      const [queueResult, categoriesResult] = await Promise.all([
        fetchUnifiedReviewQueue({ limit: 200 }),
        loadCategoriesSafe(),
      ]);
      if (queueResult.error) {
        console.error("[review-page] unified_queue", queueResult.error.code, queueResult.error.message);
        warnings.push(queueResult.error);
        queueError = queueResult.error;
      }
      if (categoriesResult.warning) warnings.push(categoriesResult.warning);
      return {
        unifiedRows: queueResult.rows,
        clipboardRows: [],
        categories: categoriesResult.rows,
        warnings,
        queueError,
      };
    }

    const [clipboardResult, categoriesResult] = await Promise.all([
      listClipboardStaging(200),
      loadCategoriesSafe(),
    ]);

    if (clipboardResult.error) {
      console.error("[review-page] clipboard_queue", clipboardResult.error.code, clipboardResult.error.message);
      warnings.push(clipboardResult.error);
      queueError = clipboardResult.error;
    }
    if (categoriesResult.warning) warnings.push(categoriesResult.warning);

    return {
      unifiedRows: [],
      clipboardRows: clipboardResult.rows,
      categories: categoriesResult.rows,
      warnings,
      queueError,
    };
  } catch (err) {
    const area = input.useUnifiedQueue ? "unified_queue" : "clipboard_queue";
    const warning = classifyReviewFetchError(area, err);
    console.error("[review-page]", area, warning.code, warning.message);
    return {
      ...empty,
      warnings: [warning],
      queueError: warning,
    };
  }
}
