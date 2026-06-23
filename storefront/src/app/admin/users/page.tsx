import { PageHeader, PageSection, EmptyState, ErrorState, StatusBadge, TableCard } from "@/components/admin";
import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";
import {
  adminAlertSurface,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
  adminTableShell,
} from "@/components/admin/admin-theme-utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getAdminModuleAvailability, resolveAdminHealth } from "@/lib/admin/admin-health";
import { fetchAdminUsers, type AdminUserRow } from "@/lib/admin/admin-users";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { UserRowActions } from "./UserRowActions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users | GloveCubs admin",
  robots: { index: false, follow: false },
};

function isApproved(u: AdminUserRow): boolean {
  return u.is_approved === 1 || u.is_approved === true;
}

export default async function AdminUsersPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Users" description="Sign in as an admin operator." />
      </div>
    );
  }

  const health = resolveAdminHealth();
  const availability = getAdminModuleAvailability(health, "users");

  return (
    <div>
      <PageHeader
        title="Buyer users"
        description="Approve accounts and set payment terms / discount tiers for B2B buyer profiles."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="users" reason={availability.reason} />
      ) : (
        <UsersContent />
      )}
    </div>
  );
}

async function UsersContent() {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorState
        title="Could not load users"
        message="Database credentials are not configured. Review Admin Health for configuration status."
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const { rows, error, status } = await fetchAdminUsers(supabase);
  const pending = rows.filter((u) => !isApproved(u));

  if (error) {
    return (
      <ErrorState
        title="Could not load users"
        message={status >= 500 ? "This module could not be loaded. Try again in a moment." : error}
      />
    );
  }

  return (
    <>
      {pending.length > 0 ? (
        <div className={cn(adminAlertSurface("warning"), "mb-4")} role="status">
          {pending.length} user{pending.length === 1 ? "" : "s"} awaiting approval.
        </div>
      ) : null}

      <PageSection title={`Accounts (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No buyer users yet"
            description="Buyer accounts will appear here once portal sign-ups create public.users profiles."
          />
        ) : (
          <TableCard>
            <div className="overflow-x-auto">
              <table className={cn(adminTableShell, "min-w-[960px]")}>
                <thead className={adminTableHead}>
                  <tr>
                    {["Company", "Contact", "Email", "Status", "Actions"].map((h) => (
                      <th key={h} className={cn(adminTableHeadCell, "px-3 py-2")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={adminTableBody}>
                  {rows.slice(0, 150).map((u) => (
                    <tr key={u.id} className={cn(adminTableRowHover, "align-top")}>
                      <td className={cn(adminTableCell, "px-3 py-2")}>{u.company_name || "—"}</td>
                      <td className={cn(adminTableCell, "px-3 py-2")}>{u.contact_name || "—"}</td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>{u.email}</td>
                      <td className={cn(adminTableCell, "px-3 py-2")}>
                        <StatusBadge status={isApproved(u) ? "approved" : "pending"} />
                      </td>
                      <td className={cn(adminTableCell, "px-3 py-2")}>
                        <UserRowActions
                          userId={u.id}
                          isApproved={isApproved(u)}
                          discountTier={u.discount_tier || "standard"}
                          paymentTerms={u.payment_terms || "credit_card"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 150 ? (
                <p className="border-t border-admin-border-subtle px-3 py-2 text-xs text-admin-muted">
                  Showing first 150 users.
                </p>
              ) : null}
            </div>
          </TableCard>
        )}
      </PageSection>
    </>
  );
}
