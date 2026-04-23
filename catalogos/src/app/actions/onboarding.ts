"use server";

import { revalidatePath } from "next/cache";
import { createOnboardingRequestSchema, updateOnboardingRequestSchema } from "@/lib/onboarding/schemas";
import {
  createOnboardingRequest,
  updateOnboardingRequest,
  getOnboardingRequestByAccessToken,
  setOnboardingStatus,
  setRequestedMoreInfo,
  createSupplierFromOnboarding,
  createFeedFromOnboarding,
  triggerIngestionForOnboarding,
  completeOnboarding,
  rejectOnboarding,
} from "@/lib/onboarding/requests";
import {
  uploadOnboardingFile,
  getOnboardingFileSignedUrl,
  deleteOnboardingFile,
  type FileKind,
} from "@/lib/onboarding/storage";

const ONBOARDING_PATHS = ["/dashboard/onboarding", "/dashboard/suppliers", "/dashboard/feeds", "/supplier-intake"];

async function revalidate() {
  ONBOARDING_PATHS.forEach((p) => revalidatePath(p));
}

export interface OnboardingActionResult {
  success: boolean;
  error?: string;
  id?: string;
  accessToken?: string;
  supplierId?: string;
  feedId?: string;
  batchId?: string;
  fileId?: string;
}

export async function createOnboardingRequestAction(
  input: unknown
): Promise<OnboardingActionResult> {
  const parsed = createOnboardingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors.map((e) => e.message).join("; ") };
  }
  try {
    const result = await createOnboardingRequest(parsed.data);
    await revalidate();
    return { success: true, id: result.id, accessToken: result.accessToken };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create request" };
  }
}

export async function requestMoreInfoOnboardingAction(
  id: string,
  notes: string
): Promise<OnboardingActionResult> {
  try {
    await setRequestedMoreInfo(id, notes);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to request more info" };
  }
}

export async function updateOnboardingByTokenAction(
  token: string,
  input: unknown
): Promise<OnboardingActionResult> {
  const request = await getOnboardingRequestByAccessToken(token);
  if (!request) return { success: false, error: "Invalid or expired link" };
  const parsed = updateOnboardingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors.map((e) => e.message).join("; ") };
  }
  const { status, ...rest } = parsed.data;
  if (status !== undefined) return { success: false, error: "Cannot change status from portal" };
  try {
    await updateOnboardingRequest(request.id, rest);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}

export async function uploadOnboardingFileAction(
  requestIdOrToken: string,
  formData: FormData,
  options?: { byToken?: boolean }
): Promise<OnboardingActionResult & { fileId?: string }> {
  let requestId: string;
  if (options?.byToken) {
    const request = await getOnboardingRequestByAccessToken(requestIdOrToken);
    if (!request) return { success: false, error: "Invalid or expired link" };
    requestId = request.id;
  } else {
    requestId = requestIdOrToken;
  }
  const file = formData.get("file") as File | null;
  const fileKind = (formData.get("fileKind") as FileKind) || "other";
  if (!file?.size) return { success: false, error: "No file provided" };
  try {
    const result = await uploadOnboardingFile({ requestId, file, fileKind });
    if (!result.success) return { success: false, error: result.error };
    await revalidate();
    return { success: true, fileId: result.fileId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function getOnboardingFileUrlAction(
  requestId: string,
  fileId: string,
  options?: { byToken?: boolean; token?: string }
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (options?.byToken && options?.token) {
    const request = await getOnboardingRequestByAccessToken(options.token);
    if (!request || request.id !== requestId) return { success: false, error: "Invalid or expired link" };
  }
  const url = await getOnboardingFileSignedUrl(requestId, fileId);
  return url ? { success: true, url } : { success: false, error: "File not found" };
}

export async function deleteOnboardingFileAction(
  requestId: string,
  fileId: string
): Promise<OnboardingActionResult> {
  try {
    const ok = await deleteOnboardingFile(requestId, fileId);
    await revalidate();
    return ok ? { success: true } : { success: false, error: "File not found" };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export async function updateOnboardingRequestAction(
  id: string,
  input: unknown
): Promise<OnboardingActionResult> {
  const parsed = updateOnboardingRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors.map((e) => e.message).join("; ") };
  }
  try {
    await updateOnboardingRequest(id, parsed.data);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}

export async function setOnboardingStatusAction(
  id: string,
  status: "ready_for_review" | "approved"
): Promise<OnboardingActionResult> {
  try {
    await setOnboardingStatus(id, status);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update status" };
  }
}

export async function approveOnboardingAction(id: string): Promise<OnboardingActionResult> {
  return setOnboardingStatusAction(id, "approved");
}

export async function createSupplierFromOnboardingAction(
  id: string
): Promise<OnboardingActionResult> {
  try {
    const { supplierId } = await createSupplierFromOnboarding(id);
    await revalidate();
    return { success: true, supplierId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create supplier" };
  }
}

export async function createFeedFromOnboardingAction(id: string): Promise<OnboardingActionResult> {
  try {
    const { feedId } = await createFeedFromOnboarding(id);
    await revalidate();
    return { success: true, feedId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create feed" };
  }
}

export async function triggerIngestionForOnboardingAction(
  id: string
): Promise<OnboardingActionResult> {
  try {
    const { batchId } = await triggerIngestionForOnboarding(id);
    await revalidate();
    return { success: true, batchId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to trigger ingestion" };
  }
}

export async function completeOnboardingAction(id: string): Promise<OnboardingActionResult> {
  try {
    await completeOnboarding(id);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to complete" };
  }
}

export async function rejectOnboardingAction(
  id: string,
  notes?: string | null
): Promise<OnboardingActionResult> {
  try {
    await rejectOnboarding(id, notes);
    await revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to reject" };
  }
}
