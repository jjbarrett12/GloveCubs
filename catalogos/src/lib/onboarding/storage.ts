/**
 * Supplier onboarding file uploads to Supabase Storage.
 * Bucket: supplier-onboarding. Path: {request_id}/{file_id}_{sanitized_filename}
 */

import { randomUUID } from "crypto";
import { getSupabaseCatalogos } from "@/lib/db/client";

export const ONBOARDING_BUCKET = "supplier-onboarding";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_PREFIXES = ["application/pdf", "text/csv", "text/plain", "application/json", "application/vnd"];

export type FileKind = "catalog_pdf" | "catalog_csv" | "price_list" | "other";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export interface UploadOnboardingFileInput {
  requestId: string;
  file: File;
  fileKind: FileKind;
}

export interface UploadOnboardingFileResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

export async function uploadOnboardingFile(input: UploadOnboardingFileInput): Promise<UploadOnboardingFileResult> {
  const supabase = getSupabaseCatalogos(true);
  const { requestId, file, fileKind } = input;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: "File too large (max 50 MB)" };
  }
  const contentType = file.type || "application/octet-stream";
  const allowed = ALLOWED_PREFIXES.some((p) => contentType.startsWith(p)) || contentType === "application/octet-stream";
  if (!allowed) {
    return { success: false, error: "File type not allowed. Use PDF, CSV, Excel, or text." };
  }

  const fileId = randomUUID();
  const safeName = sanitizeFilename(file.name);
  const storagePath = `${requestId}/${fileId}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(ONBOARDING_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (uploadErr) {
    return { success: false, error: uploadErr.message };
  }

  const { error: insertErr } = await supabase.from("supplier_onboarding_files").insert({
    id: fileId,
    request_id: requestId,
    storage_key: storagePath,
    filename: file.name,
    content_type: contentType,
    file_kind: fileKind,
  });

  if (insertErr) {
    await supabase.storage.from(ONBOARDING_BUCKET).remove([storagePath]);
    return { success: false, error: insertErr.message };
  }

  return { success: true, fileId };
}

export async function getOnboardingFileSignedUrl(
  requestId: string,
  fileId: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase
    .from("supplier_onboarding_files")
    .select("storage_key")
    .eq("id", fileId)
    .eq("request_id", requestId)
    .single();
  if (!row?.storage_key) return null;
  const { data: signed } = await supabase.storage
    .from(ONBOARDING_BUCKET)
    .createSignedUrl(row.storage_key, expiresInSeconds);
  return signed?.signedUrl ?? null;
}

export async function deleteOnboardingFile(requestId: string, fileId: string): Promise<boolean> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase
    .from("supplier_onboarding_files")
    .select("storage_key")
    .eq("id", fileId)
    .eq("request_id", requestId)
    .single();
  if (!row?.storage_key) return false;
  await supabase.storage.from(ONBOARDING_BUCKET).remove([row.storage_key]);
  await supabase.from("supplier_onboarding_files").delete().eq("id", fileId).eq("request_id", requestId);
  return true;
}
