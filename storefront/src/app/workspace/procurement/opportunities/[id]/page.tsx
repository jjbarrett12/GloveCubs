import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerOpportunityPresentationState } from "@/lib/procurement/customer-procurement-read-models";
import {
  ContactAdvisorForm,
  OpportunityActionForms,
  RecordViewedRecommendation,
} from "@/app/workspace/procurement/CustomerProcurementClient";

export const dynamic = "force-dynamic";

export default async function CustomerOpportunityDetailPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const state = await fetchCustomerOpportunityPresentationState(supabase, session.companyId, params.id);
  if (!state) notFound();

  if (state.kind === "under_review") {
    return (
      <div className="text-sm">
        <RecordViewedRecommendation savingsOpportunityId={state.id} />
        <p className="text-white/70">
          This procurement note is under review. Economics are being reconciled with the latest governed data — please
          check back or contact your advisor.
        </p>
        <ContactAdvisorForm />
      </div>
    );
  }

  const o = state.dto;
  const delta = o.economics.estimated_delta_per_basis;
  const deltaNote =
    delta === 0
      ? "No unit difference on the recorded basis between the two trusted observations."
      : delta > 0
        ? "On the recorded basis, the alternate shows a lower normalized unit value than the current line in trusted observations (not a commitment)."
        : "On the recorded basis, the alternate shows a higher normalized unit value than the current line in trusted observations (not a commitment).";

  return (
    <div className="text-sm">
      <RecordViewedRecommendation savingsOpportunityId={o.id} />
      <p className="mb-2">
        <Link href="/workspace/procurement/opportunities" className="text-sky-400 hover:underline">
          ← Approved notes
        </Link>
      </p>
      <h2 className="text-base font-medium text-white/90">Approved alternate (operator-reviewed)</h2>
      <p className="mt-2 text-white/60">
        <span className="text-white/80">{o.source_product.label}</span> →{" "}
        <span className="text-white/80">{o.candidate_product.label}</span>
      </p>
      <dl className="mt-4 grid gap-2 text-xs text-white/70">
        <div>
          <dt className="text-white/45">Basis UOM</dt>
          <dd>{o.basis_uom}</dd>
        </div>
        <div>
          <dt className="text-white/45">Normalized source unit (trusted observation)</dt>
          <dd>{o.economics.source_unit_price_normalized.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-white/45">Normalized alternate unit (trusted observation)</dt>
          <dd>{o.economics.candidate_unit_price_normalized.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-white/45">Difference per basis (source minus alternate)</dt>
          <dd>{delta.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-white/45">Trusted observation dates</dt>
          <dd>
            Source {o.economics.observed_at_source.slice(0, 10)} · Alternate {o.economics.observed_at_candidate.slice(0, 10)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-white/50">{deltaNote}</p>
      <p className="mt-2 text-xs text-white/45">
        Approved for your workspace on {o.approved_for_customer_at?.slice(0, 10) ?? "—"}.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {o.source_product.slug ? (
          <Link className="text-sky-400 hover:underline" href={`/store/p/${o.source_product.slug}`}>
            Store listing: current line
          </Link>
        ) : null}
        {o.candidate_product.slug ? (
          <Link className="text-sky-400 hover:underline" href={`/store/p/${o.candidate_product.slug}`}>
            Store listing: alternate
          </Link>
        ) : null}
      </div>
      <OpportunityActionForms savingsOpportunityId={o.id} />
      <ContactAdvisorForm />
    </div>
  );
}
