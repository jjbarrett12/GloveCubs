/**
 * Compare a staging row version from direct Postgres with the value the review page sends.
 *
 * node-pg returns timestamptz as a Date, and JSON turns that Date into a millisecond ISO string.
 * Postgres stores microseconds, but this round trip has already dropped them, so equality is at
 * millisecond resolution. Two writes in the same millisecond compare as the same version.
 */
export function sameStagingRowVersion(current: unknown, expected: string): boolean {
  if (current === expected) return true;
  const currentMs = current instanceof Date ? current.getTime() : Date.parse(String(current));
  const expectedMs = Date.parse(expected);
  return Number.isFinite(currentMs) && Number.isFinite(expectedMs) && currentMs === expectedMs;
}
