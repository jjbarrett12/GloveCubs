/**
 * Portal company status filtering — only gc_commerce.companies.status === 'active' grants buyer portal access.
 */

export const PORTAL_ACTIVE_COMPANY_STATUS = "active";

export function isPortalActiveCompanyStatus(status: string | null | undefined): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === PORTAL_ACTIVE_COMPANY_STATUS;
}

export function filterActiveMembershipCompanyIds(
  membershipCompanyIds: string[],
  companies: Array<{ id: string; status: string | null } | null | undefined>,
): {
  activeIds: string[];
  hasMembership: boolean;
  allInactiveOrMissing: boolean;
} {
  const sortedMembershipIds = [...membershipCompanyIds].sort();
  const statusById = new Map<string, string | null>();
  for (const row of companies) {
    if (!row?.id) continue;
    statusById.set(String(row.id), row.status ?? null);
  }

  const activeIds = sortedMembershipIds.filter((id) => {
    if (!statusById.has(id)) return false;
    return isPortalActiveCompanyStatus(statusById.get(id));
  });

  return {
    activeIds,
    hasMembership: sortedMembershipIds.length > 0,
    allInactiveOrMissing: sortedMembershipIds.length > 0 && activeIds.length === 0,
  };
}

export const COMPANY_NOT_ACTIVE_BUYER_MESSAGE =
  "Your company account is not active yet. Contact GloveCubs support or your account representative.";
