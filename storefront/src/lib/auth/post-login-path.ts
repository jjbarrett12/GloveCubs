/**
 * Pure post-login destination rules (shared by LoginClient and tests).
 *
 * Active admins must not be sent to `/request-pricing` just because `next` pointed there
 * (e.g. bulk-builder handoff); they should land in `/admin` unless `next` is a path we
 * intentionally preserve (quote cart, workspace, admin, account return, store, etc.).
 */
function pathOnlyForRedirectRule(p: string): string {
  const raw = (p ?? "").trim().split("?")[0] ?? "";
  if (!raw) return "/";
  const noTrail = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return noTrail || "/";
}

export function resolvePostLoginRedirectPath(input: {
  hasExplicitNext: boolean;
  safeNextPath: string;
  isActiveAdmin: boolean;
}): string {
  if (!input.hasExplicitNext) {
    return input.isActiveAdmin ? "/admin" : "/account";
  }
  if (input.isActiveAdmin && pathOnlyForRedirectRule(input.safeNextPath) === "/request-pricing") {
    return "/admin";
  }
  return input.safeNextPath;
}
