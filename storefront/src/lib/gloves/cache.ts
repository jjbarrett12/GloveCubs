/**
 * In-memory cache for Find My Glove lookup data (use cases, risk profiles).
 * Reduces DB round-trips when the same data is requested repeatedly.
 */

const useCasesCache: { data: unknown[] | null } = { data: null };
const riskProfilesCache = new Map<string, { data: unknown[] }>();

export function getCachedUseCases<T>(): T[] | null {
  return useCasesCache.data as T[] | null;
}

export function setCachedUseCases<T>(data: T[]): void {
  useCasesCache.data = data;
}

export function getCachedRiskProfiles(useCaseKey: string): unknown[] | null {
  return riskProfilesCache.get(useCaseKey)?.data ?? null;
}

export function setCachedRiskProfiles(useCaseKey: string, data: unknown[]): void {
  riskProfilesCache.set(useCaseKey, { data });
}
