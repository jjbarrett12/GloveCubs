/**
 * After normalization + matching + family + image enrichment, label rows for operator / future auto-approve.
 * Stored on normalized_data: ingestion_disposition, ingestion_review_reasons (non-breaking JSON).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { IMAGE_CONFIDENCE_AUTO_CANDIDATE_MIN } from "./image-enrichment";

const HIGH_MATCH = 0.85;
const LOW_MATCH = 0.6;
const PAGE = 200;

export type IngestionDisposition = "auto_candidate" | "needs_review";

function collectReasons(input: {
  imageMissing: boolean;
  lowConfidenceImage: boolean;
  matchConfidence: number | null;
  hasMaster: boolean;
  title: string;
  sku: string;
  familyConflictFlags: string[];
}): string[] {
  const r: string[] = [];
  if (input.imageMissing) r.push("no_image");
  if (input.lowConfidenceImage) r.push("low_confidence_image");
  if (input.matchConfidence != null && input.matchConfidence < LOW_MATCH && !input.hasMaster) {
    r.push("low_confidence_match");
  }
  if (!input.title.trim() || input.title === "Untitled") r.push("missing_title");
  if (!input.sku.trim() || input.sku === "UNKNOWN") r.push("missing_sku");
  for (const f of input.familyConflictFlags) {
    if (f) r.push(`family_flag:${f}`);
  }
  return r;
}

function familyFlagsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const flags = (meta as { flags?: string[] }).flags;
  return Array.isArray(flags) ? flags.filter((x) => typeof x === "string") : [];
}

/**
 * Set ingestion_disposition on each row in the batch.
 */
export async function runIngestionDispositionForBatch(batchId: string): Promise<{
  autoCandidate: number;
  needsReview: number;
}> {
  const supabase = getSupabaseCatalogos(true);
  const counts = { autoCandidate: 0, needsReview: 0 };

  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error } = await supabase
      .from("supplier_products_normalized")
      .select("id, match_confidence, master_product_id, family_group_key, grouping_confidence, family_group_meta, normalized_data")
      .eq("batch_id", batchId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`disposition load: ${error.message}`);
    const chunk = rows ?? [];
    if (chunk.length === 0) break;

    for (const row of chunk) {
      const id = (row as { id: string }).id;
      const nd = { ...((row as { normalized_data: Record<string, unknown> }).normalized_data ?? {}) };
      const matchConf =
        (row as { match_confidence: number | null }).match_confidence != null
          ? Number((row as { match_confidence: number | null }).match_confidence)
          : null;
      const masterId = (row as { master_product_id: string | null }).master_product_id;
      const familyKey = (row as { family_group_key: string | null }).family_group_key;
      const groupConf = (row as { grouping_confidence: number | null }).grouping_confidence;
      const meta = (row as { family_group_meta: unknown }).family_group_meta;

      const imageMissing = nd.image_missing === true;
      const title = String(nd.canonical_title ?? "");
      const sku = String(nd.supplier_sku ?? "");
      const hasImage =
        !imageMissing &&
        (Array.isArray(nd.images) ? nd.images.length > 0 : Boolean(httpUrl(nd.image_url)));

      const imgConf = nd.image_confidence != null ? Number(nd.image_confidence) : null;
      const imgSource = String(nd.image_source ?? "");
      const familyImgSource = String(nd.family_image_source ?? "");
      const underlyingSource =
        imgSource === "family_assign" && familyImgSource ? familyImgSource : imgSource;
      const lowConfidenceImage =
        hasImage &&
        imgConf != null &&
        Number.isFinite(imgConf) &&
        imgConf < IMAGE_CONFIDENCE_AUTO_CANDIDATE_MIN &&
        (underlyingSource === "search" || underlyingSource === "title_match");

      const reasons = collectReasons({
        imageMissing,
        lowConfidenceImage,
        matchConfidence: matchConf,
        hasMaster: Boolean(masterId),
        title,
        sku,
        familyConflictFlags: familyFlagsFromMeta(meta),
      });

      const inFamily = Boolean(familyKey);
      const strongFamily =
        inFamily && groupConf != null && Number(groupConf) >= 0.65;
      const attrs = (nd.filter_attributes ?? {}) as Record<string, unknown>;
      const cleanNewProduct =
        !masterId &&
        attrs.category === "disposable_gloves" &&
        typeof attrs.material === "string" &&
        typeof attrs.size === "string";

      let disposition: IngestionDisposition = "needs_review";
      const hardBlockReasons = reasons.filter((x) => x !== "low_confidence_image");
      if (hardBlockReasons.length === 0 && hasImage && !lowConfidenceImage) {
        const highMatchToMaster =
          masterId != null && matchConf != null && matchConf >= HIGH_MATCH;
        const variantFamilyAuto =
          inFamily &&
          strongFamily &&
          !masterId &&
          cleanNewProduct;
        if (highMatchToMaster || variantFamilyAuto) {
          disposition = "auto_candidate";
        }
      }

      nd.ingestion_disposition = disposition;
      nd.ingestion_review_reasons = reasons.length > 0 ? reasons : undefined;
      if (disposition === "auto_candidate") counts.autoCandidate++;
      else counts.needsReview++;

      await supabase.from("supplier_products_normalized").update({ normalized_data: nd }).eq("id", id);
    }

    if (chunk.length < PAGE) break;
  }

  return counts;
}

function httpUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return v.startsWith("http://") || v.startsWith("https://");
}
