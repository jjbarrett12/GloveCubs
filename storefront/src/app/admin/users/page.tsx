import { PageHeader, PageSection } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminUsersFromExpress, type ExpressAdminUserRow } from "@/lib/admin/admin-users-express";
import { UserRowActions } from "./UserRowActions";

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

  const { rows, error, status } = await fetchAdminUsersFromExpress(operator);
  const pending = rows.filter((u) => !isApproved(u));

  return (
    <div>
      <PageHeader
        title="Buyer users"
        description="Approve accounts and set payment terms / discount tiers via the transitional Express admin API."
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
          {status === 503 ? " — check JWT_SECRET and NEXT_PUBLIC_GLOVECUBS_API." : null}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <p className="mb-3 text-sm text-amber-900">
          {pending.length} user{pending.length === 1 ? "" : "s"} awaiting approval.
        </p>
      ) : null}

      <PageSection title={`Accounts (${rows.length})`}>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No users returned.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 align-top last:border-0">
                    <td className="px-3 py-2 text-gray-900">{u.company_name || "—"}</td>
                    <td className="px-3 py-2 text-gray-800">{u.contact_name || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{u.email}</td>
                    <td className="px-3 py-2">
                      {isApproved(u) ? (
                        <span className="text-green-800">Approved</span>
                      ) : (
                        <span className="font-semibold text-amber-800">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
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
              <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">Showing first 150 users.</p>
            ) : null}
          </div>
        )}
      </PageSection>
    </div>
  );
}
