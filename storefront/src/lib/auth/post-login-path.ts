/**
 * Pure post-login destination rules (shared by LoginClient and tests).
 */
export function resolvePostLoginRedirectPath(input: {
  hasExplicitNext: boolean;
  safeNextPath: string;
  isActiveAdmin: boolean;
}): string {
  if (input.hasExplicitNext) return input.safeNextPath;
  return input.isActiveAdmin ? "/admin" : "/account";
}
