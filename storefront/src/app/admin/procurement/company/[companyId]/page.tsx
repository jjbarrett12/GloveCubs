import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProcurementCompanyHubPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium">Company workspace</h2>
      <p className="font-mono text-xs text-white/60">{companyId}</p>
      <ul className="list-inside list-disc space-y-2 text-sm text-sky-300">
        <li>
          <Link href={`/admin/procurement/company/${companyId}/queue`} className="hover:underline">
            Recommendation review queue
          </Link>
        </li>
        <li>
          <Link href={`/admin/procurement/company/${companyId}/blocked`} className="hover:underline">
            Blocked recommendations
          </Link>
        </li>
        <li>
          <Link href={`/admin/procurement/company/${companyId}/spend`} className="hover:underline">
            Trusted spend history
          </Link>
        </li>
        <li>
          <Link href={`/admin/procurement/company/${companyId}/suppliers`} className="hover:underline">
            Supplier observation summary
          </Link>
        </li>
        <li>
          <Link href={`/admin/procurement/company/${companyId}/reorder`} className="hover:underline">
            Reorder memory
          </Link>
        </li>
      </ul>
      <p className="text-xs text-white/50">
        <Link href="/admin/procurement" className="text-sky-300 hover:underline">
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}
