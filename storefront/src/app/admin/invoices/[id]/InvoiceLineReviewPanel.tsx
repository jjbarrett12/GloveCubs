"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminFormInput, adminPrimaryButton, adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export type InvoiceLineReviewRow = {
  id: string;
  line_index: number;
  raw_description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  supplier_sku: string | null;
  manufacturer_sku: string | null;
  quantity_uom: string | null;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  gloves_per_case: number | null;
  review_status: string;
  match_reason: string | null;
  match_trust_status: string | null;
  comparison_block_reason: string | null;
  competitor_product_id: string | null;
  catalog_product_id: string | null;
  comparison_snapshot: {
    trust_status?: string;
    block_reason?: string | null;
    savings?: {
      dollar_savings_per_1000: number;
      percent_savings: number;
      invoice_dollar_savings: number | null;
    } | null;
    price_basis?: { current_per_1000: number | null; glovecubs_per_1000: number | null };
    explain?: {
      current?: Record<string, unknown>;
      matched_glovecubs?: Record<string, unknown> | null;
      match_status?: string;
      match_reasons?: Array<{ attribute: string; result: string; blocking: boolean; note?: string }>;
    };
  } | null;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function GloveCubsProductSearch({
  defaultId,
  disabled,
  onPick,
}: {
  defaultId: string;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Array<{ id: string; name: string; slug: string; sku: string | null }>>([]);
  const [picked, setPicked] = React.useState(defaultId);

  async function search() {
    if (q.trim().length < 2) return;
    const res = await fetch(`/admin/api/procurement/glove-products?q=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    setHits((json as { products?: Array<{ id: string; name: string; slug: string; sku: string | null }> }).products ?? []);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search GloveCubs name or SKU"
          className={cn(adminFormInput, "max-w-md")}
        />
        <button type="button" className={adminPrimaryButton} disabled={disabled} onClick={() => void search()}>
          Search
        </button>
      </div>
      {hits.length > 0 ? (
        <ul className="text-sm">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={adminPrimaryButton}
                disabled={disabled}
                onClick={() => {
                  setPicked(h.id);
                  onPick(h.id);
                }}
              >
                Use {h.name}
              </button>{" "}
              <span className="text-admin-muted">
                {h.sku ?? h.slug} · {h.id.slice(0, 8)}…
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <input name="catalog_product_id" className={adminFormInput} value={picked} onChange={(e) => setPicked(e.target.value)} />
    </div>
  );
}

export function InvoiceLineReviewPanel({ lines }: { lines: InvoiceLineReviewRow[] }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: url.includes("recompute") ? "POST" : url.includes("equivalencies/") ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
    return json;
  }

  async function confirmCompetitor(line: InvoiceLineReviewRow, form: FormData) {
    setPending(line.id);
    setMsg(null);
    try {
      await postJson("/admin/api/procurement/competitor-products", {
        manufacturer: String(form.get("manufacturer") ?? "").trim() || null,
        sku: String(form.get("sku") ?? "").trim() || line.supplier_sku,
        product_name: String(form.get("product_name") ?? "").trim() || line.raw_description,
        material: String(form.get("material") ?? "").trim() || null,
        grade: String(form.get("grade") ?? "").trim() || null,
        thickness_mil: form.get("thickness_mil") ? Number(form.get("thickness_mil")) : null,
        invoice_line_id: line.id,
        invoice_description: line.raw_description,
        upc_gtin: String(form.get("upc_gtin") ?? "").trim() || null,
        quantity_uom: line.quantity_uom,
        gloves_per_box: line.gloves_per_box,
        boxes_per_case: line.boxes_per_case,
        gloves_per_case: line.gloves_per_case,
      });
      setMsg("Competitor confirmed. Future invoices with this SKU resolve without AI.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
    setPending(null);
  }

  async function proposeEquivalent(line: InvoiceLineReviewRow, catalogProductId: string) {
    if (!line.competitor_product_id) {
      setMsg("Confirm the competitor product first.");
      return;
    }
    setPending(line.id);
    setMsg(null);
    try {
      await postJson("/admin/api/procurement/competitor-equivalencies", {
        competitor_product_id: line.competitor_product_id,
        catalog_product_id: catalogProductId,
        invoice_line_id: line.id,
      });
      setMsg("Candidate equivalency saved (not approved).");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
    setPending(null);
  }

  async function setEquivalencyStatus(equivalencyId: string, lineId: string, status: "approved" | "rejected") {
    setPending(lineId);
    setMsg(null);
    try {
      await fetch(`/admin/api/procurement/competitor-equivalencies/${equivalencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, invoice_line_id: lineId }),
      }).then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
      });
      setMsg(status === "approved" ? "Equivalency approved." : "Equivalency rejected.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
    setPending(null);
  }

  async function savePack(lineId: string, form: FormData) {
    setPending(lineId);
    setMsg(null);
    try {
      const uom = String(form.get("quantity_uom") ?? "").trim();
      await fetch(`/admin/api/invoice-lines/${lineId}/pack`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity_uom: uom === "EA" || uom === "BX" || uom === "CS" ? uom : null,
          gloves_per_box: form.get("gloves_per_box") ? Number(form.get("gloves_per_box")) : null,
          boxes_per_case: form.get("boxes_per_case") ? Number(form.get("boxes_per_case")) : null,
          gloves_per_case: form.get("gloves_per_case") ? Number(form.get("gloves_per_case")) : null,
        }),
      }).then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
      });
      setMsg("Packaging updated.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
    setPending(null);
  }

  async function recompute(lineId: string) {
    setPending(lineId);
    setMsg(null);
    try {
      await fetch(`/admin/api/invoice-lines/${lineId}/recompute-comparison`, { method: "POST" }).then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
      });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Recompute failed");
    }
    setPending(null);
  }

  if (lines.length === 0) {
    return <p className="text-sm text-admin-muted">No persisted invoice lines yet.</p>;
  }

  return (
    <div className="space-y-6">
      {msg ? <p className="text-sm text-admin-secondary">{msg}</p> : null}
      {lines.map((line) => {
        const snap = line.comparison_snapshot;
        const current = snap?.explain?.current ?? {};
        const gc = snap?.explain?.matched_glovecubs ?? null;
        const eqId =
          gc && typeof gc === "object" && "equivalency_id" in gc ? String((gc as { equivalency_id?: string }).equivalency_id ?? "") : "";
        return (
          <article key={line.id} className="rounded-lg border border-admin-border p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-admin-primary">
                Line {line.line_index + 1}: {line.raw_description || "—"}
              </h3>
              <p className="text-xs text-admin-muted">
                Trust: {line.match_trust_status ?? "—"} · Review: {line.review_status}
                {line.comparison_block_reason ? ` · Block: ${line.comparison_block_reason}` : ""}
              </p>
            </header>
            <dl className={cn("grid gap-2 sm:grid-cols-2", adminTableCell)}>
              <div>
                <dt className="text-xs font-semibold uppercase text-admin-muted">Current</dt>
                <dd className="whitespace-pre-wrap text-sm">
                  {String(current.manufacturer ?? "")} {String(current.name ?? line.raw_description)}
                  {"\n"}SKU {String(current.sku ?? line.supplier_sku ?? "—")}
                  {"\n"}
                  {[current.material, current.grade, current.color, current.thickness_mil != null ? `${current.thickness_mil} mil` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {"\n"}
                  {line.quantity_uom ?? "UoM?"} · {line.gloves_per_box ?? "?"} / box · {line.boxes_per_case ?? "?"} boxes/case
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-admin-muted">Matched GloveCubs</dt>
                <dd className="whitespace-pre-wrap text-sm">
                  {gc
                    ? `${String(gc.name ?? "—")}\n${String(gc.sku ?? gc.catalog_product_id ?? "")}\n${[
                        gc.material,
                        gc.grade,
                        gc.color,
                        gc.thickness_mil != null ? `${gc.thickness_mil} mil` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}`
                    : "None — unidentified or candidate only"}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-sm">
              Status: {snap?.explain?.match_status ?? line.match_trust_status ?? "—"}
            </p>
            {snap?.explain?.match_reasons?.length ? (
              <ul className="mt-1 text-xs text-admin-secondary">
                {snap.explain.match_reasons.map((r) => (
                  <li key={r.attribute}>
                    {r.attribute}: {r.result}
                    {r.blocking ? " (blocking)" : ""}
                    {r.note ? ` — ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-sm">
              Price basis / 1,000: current {money(snap?.price_basis?.current_per_1000)} · GloveCubs{" "}
              {money(snap?.price_basis?.glovecubs_per_1000)}
            </p>
            <p className="text-sm font-medium">
              Savings:{" "}
              {snap?.savings
                ? `${money(snap.savings.dollar_savings_per_1000)} / 1,000 (${snap.savings.percent_savings.toFixed(1)}%)`
                : "null (gated)"}
            </p>

            <form
              className="mt-4 grid gap-2 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                void confirmCompetitor(line, new FormData(e.currentTarget));
              }}
            >
              <input name="manufacturer" placeholder="Manufacturer" className={adminFormInput} defaultValue="" />
              <input name="sku" placeholder="SKU" className={adminFormInput} defaultValue={line.supplier_sku ?? ""} />
              <input name="product_name" placeholder="Product name" className={adminFormInput} defaultValue="" />
              <input name="material" placeholder="Material" className={adminFormInput} />
              <input name="grade" placeholder="Grade" className={adminFormInput} />
              <input name="thickness_mil" placeholder="Thickness mil" className={adminFormInput} />
              <input name="upc_gtin" placeholder="UPC / GTIN" className={adminFormInput} />
              <button type="submit" disabled={pending === line.id} className={adminPrimaryButton}>
                Confirm competitor
              </button>
            </form>

            <form
              className="mt-3 grid gap-2 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                void savePack(line.id, new FormData(e.currentTarget));
              }}
            >
              <input name="quantity_uom" placeholder="EA|BX|CS" className={adminFormInput} defaultValue={line.quantity_uom ?? ""} />
              <input name="gloves_per_box" placeholder="Gloves/box" className={adminFormInput} defaultValue={line.gloves_per_box ?? ""} />
              <input name="boxes_per_case" placeholder="Boxes/case" className={adminFormInput} defaultValue={line.boxes_per_case ?? ""} />
              <input name="gloves_per_case" placeholder="Gloves/case" className={adminFormInput} defaultValue={line.gloves_per_case ?? ""} />
              <button type="submit" disabled={pending === line.id} className={adminPrimaryButton}>
                Correct UoM / pack
              </button>
            </form>

            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const id = String(new FormData(e.currentTarget).get("catalog_product_id") ?? "").trim();
                if (id) void proposeEquivalent(line, id);
              }}
            >
              <GloveCubsProductSearch
                defaultId={line.catalog_product_id ?? ""}
                disabled={pending === line.id}
                onPick={() => undefined}
              />
              <button type="submit" disabled={pending === line.id} className={adminPrimaryButton}>
                Propose candidate equivalent
              </button>
            </form>

            {eqId ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={adminPrimaryButton}
                  disabled={pending === line.id}
                  onClick={() => void setEquivalencyStatus(eqId, line.id, "approved")}
                >
                  Approve equivalent
                </button>
                <button
                  type="button"
                  className={adminPrimaryButton}
                  disabled={pending === line.id}
                  onClick={() => void setEquivalencyStatus(eqId, line.id, "rejected")}
                >
                  Reject match
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className={cn(adminPrimaryButton, "mt-3")}
              disabled={pending === line.id}
              onClick={() => void recompute(line.id)}
            >
              Recompute comparison
            </button>
          </article>
        );
      })}
    </div>
  );
}
