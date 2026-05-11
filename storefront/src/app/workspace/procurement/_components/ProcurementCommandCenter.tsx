import Link from "next/link";
import type {
  CustomerApprovedOpportunityDto,
  CustomerProcurementLifecycleRowDto,
  CustomerReorderRowDto,
  CustomerTimelineRowDto,
  CustomerTrustedSpendRowDto,
} from "@/lib/procurement/customer-procurement-read-models";
import {
  buyerLifecycleStageLabel,
  buyerPipelineStageSortIndex,
  isBuyerPipelineDistributionStage,
} from "@/lib/procurement/buyer-lifecycle-copy";

const REORDER_STALE_MS = 90 * 24 * 60 * 60 * 1000;

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function ProcurementPageHeader(props: { companyLabel: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-white/45">Procurement</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-white/90">{props.companyLabel}</h2>
        <p className="mt-1 max-w-xl text-sm text-white/55">
          Command center for SourceIt-reviewed alternates, verified spend, and reorder context. Numbers come from
          governed observations — they are illustrative, not a price commitment.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <Link href="/invoice-savings" className="text-sm text-sky-400 hover:underline">
          Submit spend signal
        </Link>
        <Link href="/workspace/procurement/timeline" className="text-sm text-white/45 hover:text-white/70 hover:underline">
          Full activity
        </Link>
      </div>
    </div>
  );
}

function EmptyState(props: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-5">
      <p className="text-sm font-medium text-white/80">{props.title}</p>
      <p className="mt-1 text-sm text-white/50">{props.body}</p>
      {props.action ? (
        <p className="mt-3">
          <Link href={props.action.href} className="text-sm text-sky-400 hover:underline">
            {props.action.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function AttentionSection(props: { lifecycleRows: CustomerProcurementLifecycleRowDto[] }) {
  const followUp = props.lifecycleRows.filter((r) => r.lifecycle_stage === "sales_follow_up").length;
  const stale = props.lifecycleRows.filter((r) => r.lifecycle_stage === "stale").length;
  const hasAny = followUp > 0 || stale > 0;

  if (!hasAny) {
    return (
      <section aria-label="Needs attention">
        <h3 className="text-sm font-medium text-white/90">Needs attention</h3>
        <div className="mt-3">
          <EmptyState
            title="You’re caught up"
            body="There are no sourcing threads in follow-up or paused states for your organization right now."
            action={{ href: "/invoice-savings", label: "Submit a new spend signal" }}
          />
        </div>
      </section>
    );
  }

  const cards: { key: string; title: string; body: string; border: string }[] = [];
  if (followUp > 0) {
    cards.push({
      key: "followup",
      title: followUp === 1 ? "Follow-up needed" : `Follow-up needed (${followUp})`,
      body: "One or more sourcing threads need a quick touchpoint from you or your procurement team. Final pricing may still be in progress.",
      border: "border-amber-400/35",
    });
  }
  if (stale > 0) {
    cards.push({
      key: "stale",
      title: stale === 1 ? "Paused or superseded" : `Paused or superseded (${stale})`,
      body: "These threads may be outdated. Contact your procurement advisor if they still matter.",
      border: "border-white/15",
    });
  }

  return (
    <section aria-label="Needs attention">
      <h3 className="text-sm font-medium text-white/90">Needs attention</h3>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {cards.slice(0, 3).map((c) => (
          <div
            key={c.key}
            className={`min-w-0 flex-1 rounded-lg border ${c.border} bg-white/[0.03] px-4 py-4 sm:min-w-[240px]`}
          >
            <p className="text-sm font-medium text-white/90">{c.title}</p>
            <p className="mt-1 text-sm text-white/55">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PipelineSnapshot(props: { lifecycleRows: CustomerProcurementLifecycleRowDto[] }) {
  const counts = new Map<string, number>();
  for (const r of props.lifecycleRows) {
    if (!isBuyerPipelineDistributionStage(r.lifecycle_stage)) continue;
    counts.set(r.lifecycle_stage, (counts.get(r.lifecycle_stage) ?? 0) + 1);
  }
  const chips = Array.from(counts.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => buyerPipelineStageSortIndex(a[0]) - buyerPipelineStageSortIndex(b[0]));

  const closed = props.lifecycleRows.filter((r) => r.lifecycle_stage === "closed").length;

  if (props.lifecycleRows.length === 0) {
    return (
      <section aria-label="Sourcing pipeline">
        <h3 className="text-sm font-medium text-white/90">Sourcing threads</h3>
        <div className="mt-3">
          <EmptyState
            title="No linked sourcing threads yet"
            body="When spend signals are linked to procurement work, stage counts will appear here. This is normal for a new organization."
            action={{ href: "/invoice-savings", label: "Submit spend signal" }}
          />
        </div>
      </section>
    );
  }

  if (chips.length === 0) {
    return (
      <section aria-label="Sourcing pipeline">
        <h3 className="text-sm font-medium text-white/90">Sourcing threads</h3>
        <p className="mt-2 text-sm text-white/50">
          All linked threads are closed{closed > 0 ? ` (${closed})` : ""}. Open work will appear here when stages move
          out of closed.
        </p>
      </section>
    );
  }

  const chipBody = (
    <div className="flex flex-wrap gap-2">
      {chips.map(([stage, n]) => (
        <span
          key={stage}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs tabular-nums ${
            stage === "quote_linked"
              ? "border-sky-400/30 bg-sky-400/10 text-sky-100/90"
              : "border-white/15 bg-white/[0.04] text-white/75"
          }`}
        >
          <span>{buyerLifecycleStageLabel(stage)}</span>
          <span className="ml-1.5 text-white/45">·</span>
          <span className="ml-1.5 text-white/60">{n}</span>
        </span>
      ))}
    </div>
  );

  return (
    <section aria-label="Sourcing pipeline">
      <h3 className="text-sm font-medium text-white/90">Sourcing threads</h3>
      <p className="mt-1 text-xs text-white/45">
        Counts by stage for threads linked to your organization. This is a distribution summary — not a completion bar.
        “Pricing in progress” does not mean final terms are ready.
      </p>
      <div className="mt-3 hidden sm:block">{chipBody}</div>
      <details className="mt-3 sm:hidden">
        <summary className="cursor-pointer rounded px-0.5 text-sm text-sky-400 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-400/50">
          Show sourcing stage breakdown
        </summary>
        <div className="mt-3">{chipBody}</div>
      </details>
      {closed > 0 ? <p className="mt-2 text-xs text-white/40">Closed threads: {closed} (hidden from breakdown).</p> : null}
    </section>
  );
}

function HumanReviewedBadge(props: { approvedAt: string | null }) {
  if (!props.approvedAt) return null;
  return (
    <span className="inline-flex items-center rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-200/90">
      SourceIt reviewed · {formatShortDate(props.approvedAt)}
    </span>
  );
}

function SavingsCallout(props: { dto: CustomerApprovedOpportunityDto }) {
  const d = props.dto.economics.estimated_delta_per_basis;
  const basis = props.dto.basis_uom;
  const lower = d > 0;
  const higher = d < 0;
  const line =
    d === 0 || !Number.isFinite(d)
      ? `No unit difference on the recorded basis (${basis}) between the two trusted observations.`
      : lower
        ? `On basis ${basis}, the alternate shows a lower normalized unit value than your current line in trusted observations (not a commitment).`
        : higher
          ? `On basis ${basis}, the alternate shows a higher normalized unit value than your current line in trusted observations (not a commitment).`
          : "";
  return (
    <p className="text-xs leading-relaxed text-white/55">
      <span className="tabular-nums text-white/70">Estimated delta per basis: {Number.isFinite(d) ? d.toFixed(6) : "—"}</span>
      {line ? <span className="mt-1 block">{line}</span> : null}
    </p>
  );
}

function ProvenanceBlock(props: { dto: CustomerApprovedOpportunityDto }) {
  const e = props.dto.economics;
  return (
    <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px] text-white/50">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <dt className="text-white/40">Basis</dt>
        <dd className="tabular-nums text-white/65">{props.dto.basis_uom}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <dt className="text-white/40">Trusted observation · current line</dt>
        <dd className="tabular-nums text-white/65">
          {e.source_unit_price_normalized.toFixed(6)} · as of {formatShortDate(e.observed_at_source)}
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <dt className="text-white/40">Trusted observation · alternate</dt>
        <dd className="tabular-nums text-white/65">
          {e.candidate_unit_price_normalized.toFixed(6)} · as of {formatShortDate(e.observed_at_candidate)}
        </dd>
      </div>
    </dl>
  );
}

function ApprovedOpportunityCard(props: { dto: CustomerApprovedOpportunityDto }) {
  const o = props.dto;
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Approved for your organization</p>
      <h4 className="mt-2 text-sm font-semibold text-white/90">{o.candidate_product.label}</h4>
      <p className="mt-1 text-xs text-white/55">
        <span className="text-white/45">From current line:</span> {o.source_product.label}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <HumanReviewedBadge approvedAt={o.approved_for_customer_at} />
      </div>
      <SavingsCallout dto={o} />
      <ProvenanceBlock dto={o} />
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <Link
          href={`/workspace/procurement/opportunities/${o.id}`}
          className="inline-flex rounded border border-white/20 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/[0.06]"
        >
          View details
        </Link>
        {o.candidate_product.slug ? (
          <Link
            href={`/store/p/${o.candidate_product.slug}`}
            className="text-xs text-white/45 hover:text-white/70 hover:underline"
            aria-label={`View ${o.candidate_product.label} in catalog`}
          >
            View in catalog
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function ReorderSection(props: { rows: CustomerReorderRowDto[] }) {
  const now = Date.now();
  const top = props.rows.slice(0, 5);

  if (top.length === 0) {
    return (
      <section aria-label="Reorder">
        <h3 className="text-sm font-medium text-white/90">Reorder with confidence</h3>
        <div className="mt-3">
          <EmptyState
            title="No reorder shortcuts yet"
            body="Reorder items come from verified purchase history. After verified spend or approved paths, shortcuts can appear here."
            action={{ href: "/workspace/procurement/reorder", label: "Reorder workspace" }}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Reorder">
      <h3 className="text-sm font-medium text-white/90">Reorder with confidence</h3>
      <ul className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02]">
        {top.map((r) => {
          const promoted = Date.parse(r.promoted_at);
          const stale = Number.isFinite(promoted) && now - promoted > REORDER_STALE_MS;
          return (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-white/85">{r.product_label}</p>
                <p className="text-xs text-white/45">
                  Basis {r.basis_uom}
                  {r.last_trusted_unit_basis != null ? (
                    <span className="tabular-nums text-white/55"> · last verified basis {r.last_trusted_unit_basis}</span>
                  ) : null}
                  <span className="text-white/40"> · reorder list updated {formatShortDate(r.promoted_at)}</span>
                </p>
                {stale ? (
                  <p className="mt-1 text-xs text-amber-200/80">Last reorder-list update was more than 90 days ago — confirm before large orders.</p>
                ) : null}
              </div>
              <div className="shrink-0">
                {r.product_slug ? (
                  <Link
                    href={`/store/p/${r.product_slug}`}
                    className="text-xs text-white/45 hover:text-white/70 hover:underline"
                    aria-label={`View ${r.product_label} in catalog`}
                  >
                    View in catalog
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2">
        <Link href="/workspace/procurement/reorder" className="text-sm text-sky-400 hover:underline">
          Full reorder list
        </Link>
      </p>
    </section>
  );
}

function SpendPreviewTable(props: { rows: CustomerTrustedSpendRowDto[] }) {
  const top = props.rows.slice(0, 5);
  if (top.length === 0) {
    return (
      <section aria-label="Spend on record">
        <h3 className="text-sm font-medium text-white/90">Spend on record</h3>
        <div className="mt-3">
          <EmptyState
            title="No verified spend on file"
            body="Trusted observations appear after invoices are matched and governed. An empty list is normal until that work completes."
            action={{ href: "/invoice-savings", label: "Submit spend signal" }}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Spend on record">
      <h3 className="text-sm font-medium text-white/90">Spend on record</h3>
      <p className="mt-1 text-xs text-white/45">Recent trusted price observations — not a financial statement.</p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <caption className="sr-only">
            Recent verified spend: product, supplier, observation date, and observed unit price. Not a financial
            statement.
          </caption>
          <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wide text-white/45">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 font-medium">Observed</th>
              <th className="px-3 py-2 font-medium text-right">Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-white/75">
            {top.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2">{s.product_label}</td>
                <td className="px-3 py-2 text-white/55">{s.supplier_label ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-white/50">{formatShortDate(s.observed_at)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/60">
                  {s.unit_price != null ? s.unit_price.toFixed(4) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2">
        <Link href="/workspace/procurement/spend" className="text-sm text-sky-400 hover:underline">
          Full spend history
        </Link>
      </p>
    </section>
  );
}

function ActivityFeedMini(props: { rows: CustomerTimelineRowDto[] }) {
  const top = props.rows.slice(0, 5);
  if (top.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/45">Recent activity</p>
        <p className="mt-2 text-sm text-white/50">Activity will appear when approvals, reorders, or your requests are recorded.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-white/45">Recent activity</p>
      <ul className="mt-3 space-y-3">
        {top.map((t) => (
          <li key={t.id} className="text-sm">
            <p className="text-white/80">{t.headline}</p>
            <p className="text-[11px] text-white/40">{formatShortDate(t.occurred_at)}</p>
            {t.detail ? <p className="mt-0.5 text-xs text-white/50">{t.detail}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuietStatsRail(props: {
  approvedCount: number;
  reorderCount: number;
  spendCount: number;
  threadCount: number;
}) {
  const stat = (label: string, value: number) => (
    <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-white/85">{value}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {stat("Approvals on file", props.approvedCount)}
      {stat("Reorder-ready items", props.reorderCount)}
      {stat("Verified spend lines", props.spendCount)}
      {stat("Sourcing threads", props.threadCount)}
    </div>
  );
}

function TrustDisclaimerBlock() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-white/45">
      Economics use trusted invoice observations on a declared basis UOM. They help your team decide — they are not a
      quote, contract, or price guarantee. Questions belong with your procurement contact.
    </div>
  );
}

export function ProcurementCommandCenter(props: {
  companyLabel: string;
  approved: CustomerApprovedOpportunityDto[];
  reorder: CustomerReorderRowDto[];
  spend: CustomerTrustedSpendRowDto[];
  timeline: CustomerTimelineRowDto[];
  lifecycleRows: CustomerProcurementLifecycleRowDto[];
}) {
  const approvedPreview = props.approved.slice(0, 3);

  return (
    <div className="space-y-10 text-sm">
      <ProcurementPageHeader companyLabel={props.companyLabel} />

      <AttentionSection lifecycleRows={props.lifecycleRows} />

      <PipelineSnapshot lifecycleRows={props.lifecycleRows} />

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-10 lg:col-span-7">
          <section aria-label="Approved alternates">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 className="text-sm font-medium text-white/90">Approved for you</h3>
              <Link href="/workspace/procurement/opportunities" className="text-xs text-sky-400 hover:underline">
                View all
              </Link>
            </div>
            {approvedPreview.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="Nothing approved yet"
                  body="When SourceIt approves an alternate or savings note for your organization, it will appear here with full provenance."
                  action={{ href: "/invoice-savings", label: "Submit spend signal" }}
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-1 xl:grid-cols-1">
                {approvedPreview.map((o) => (
                  <ApprovedOpportunityCard key={o.id} dto={o} />
                ))}
              </div>
            )}
          </section>

          <ReorderSection rows={props.reorder} />

          <SpendPreviewTable rows={props.spend} />
        </div>

        <aside className="space-y-6 lg:col-span-5">
          <div>
            <h3 className="text-sm font-medium text-white/90">At a glance</h3>
            <p className="mt-1 text-xs text-white/45">Operational counts from this page’s data — not analytics or goals.</p>
            <div className="mt-3">
              <QuietStatsRail
                approvedCount={props.approved.length}
                reorderCount={props.reorder.length}
                spendCount={props.spend.length}
                threadCount={props.lifecycleRows.length}
              />
            </div>
          </div>

          <ActivityFeedMini rows={props.timeline} />

          <TrustDisclaimerBlock />
        </aside>
      </div>
    </div>
  );
}
