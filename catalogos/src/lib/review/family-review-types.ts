/** Client-safe types + helpers for family-first review (no server data imports). */

export interface FamilyOperatorMeta {
  pendingIds: string[];
  pendingCount: number;
  sharedAutoApproveMasterId: string | null;
  unmatchedPendingCount: number;
  aiSuggestionReadyCount: number;
  aiMatchQueuedCount: number;
  conflictingMasters: boolean;
  conflictingAiSuggestions: boolean;
  inferenceFlags: string[];
}

export function hasFamilyConflict(meta: FamilyOperatorMeta): boolean {
  return meta.conflictingMasters || meta.conflictingAiSuggestions;
}
