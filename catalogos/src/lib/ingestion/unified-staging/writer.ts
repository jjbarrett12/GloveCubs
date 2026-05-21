/**
 * CatalogOS entrypoint for unified staging writer (telemetry wired).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";
import {
  transitionIngestionJobStatus as transitionCore,
  writeUnifiedStagingArtifacts as writeCore,
} from "../../../../../lib/unified-ingestion/writer";
import type {
  IngestionJobStatus,
  WriteUnifiedStagingInput,
  WriteUnifiedStagingResult,
} from "../../../../../lib/unified-ingestion/types";
import { emitUnifiedIngestionEvent } from "./telemetry";

export async function writeUnifiedStagingArtifacts(
  input: WriteUnifiedStagingInput,
  client: SupabaseClient = getSupabase(true)
): Promise<WriteUnifiedStagingResult> {
  return writeCore(input, client, emitUnifiedIngestionEvent);
}

export async function transitionIngestionJobStatus(
  client: SupabaseClient,
  jobId: string,
  to: IngestionJobStatus,
  patch?: { failed_reason?: string; blocked_reason?: string }
): Promise<void> {
  return transitionCore(client, jobId, to, emitUnifiedIngestionEvent, patch);
}
