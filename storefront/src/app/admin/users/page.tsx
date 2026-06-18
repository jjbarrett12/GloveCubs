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
import {
  getAdminModuleAvailability,
  resolveAdminHealth,
  sanitizeExpressModuleRuntimeError,
} from "@/lib/admin/admin-health";
import { fetchAdminUsersFromExpress, type ExpressAdminUserRow } from "@/lib/admin/admin-users-express";
import { UserRowActions } from "./UserRowActions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users | GloveCubs admin",
  robots: { index: false, follow: false },
};

function isApproved(u: ExpressAdminUserRow): boolean {
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
        description="Approve accounts and set payment terms / discount tiers via the transitional Express admin API."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="users" reason={availability.reason} />
      ) : (
        <UsersContent operator={operator} />
      )}
    </div>
  );
}

async function UsersContent({ operator }: { operator: { id: string; email: string | null } }) {
  const { rows, error, status } = await fetchAdminUsersFromExpress(operator);
  const pending = rows.filter((u) => !isApproved(u));

  if (error) {
    return <ErrorState title="Could not load users" message={sanitizeExpressModuleRuntimeError(error, status)} />;
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
            description="Buyer accounts will appear here once the fulfillment API returns user records."
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
