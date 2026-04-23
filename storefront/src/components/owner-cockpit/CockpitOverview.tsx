"use client";

import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/* —— tokens (mirror live cockpit) —— */
const surface = "bg-[#161b22] border border-white/[0.06]";
const surfaceHover = "hover:bg-[#1c2128]";
const text = "text-[#e6edf3]";
const muted = "text-[#6e7681]";
const secondary = "text-[#b1bac4]";
const accent = "text-[#e67a2e]";
const accentBg = "bg-[#e67a2e]/12 border-[#e67a2e]/30";

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("w-full max-w-[120px] h-9", className)} preserveAspectRatio="none">
      <path
        d={`M ${pts.join(" L ")}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        className="text-[#6e7681]"
      />
      <path
        d={`M ${pts.join(" L ")} L ${w - pad} ${h} L ${pad} ${h} Z`}
        fill="url(#spark)"
        className="opacity-[0.12]"
      />
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e67a2e" />
          <stop offset="100%" stopColor="#e67a2e" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const navItems: { label: string; icon: string; badge?: number }[] = [
  { label: "Overview", icon: "◉" },
  { label: "Customers", icon: "◇" },
  { label: "Orders", icon: "▤", badge: 4 },
  { label: "Products", icon: "▦" },
  { label: "Inventory", icon: "▣", badge: 7 },
  { label: "Pricing", icon: "%" },
  { label: "Vendors", icon: "◎" },
  { label: "Purchase Orders", icon: "▧" },
  { label: "AR / AP", icon: "$", badge: 2 },
  { label: "Reports", icon: "▨" },
  { label: "Users & Roles", icon: "◈" },
  { label: "Messages", icon: "✉" },
  { label: "Automations", icon: "⚡" },
  { label: "Settings", icon: "⚙" },
  { label: "Audit Log", icon: "◐" },
];

const kpis = [
  { label: "Revenue today", value: "$12,480", trend: "+8.2%", up: true, href: "#" },
  { label: "Revenue MTD", value: "$284,200", trend: "+3.1%", up: true, href: "#" },
  { label: "Gross margin", value: "31.4%", trend: "−0.4pp", up: false, href: "#" },
  { label: "Open orders", value: "23", trend: "6 ship today", up: null as boolean | null, href: "#" },
  { label: "Low stock SKUs", value: "7", trend: "2 critical", up: false, href: "#" },
  { label: "Open AR", value: "$48,200", trend: "$12k 30+", up: false, href: "#" },
  { label: "Open AP", value: "$19,400", trend: "3 due", up: null, href: "#" },
  { label: "Active customers", value: "186", trend: "+4 MTD", up: true, href: "#" },
];

const alerts = [
  { sev: "danger" as const, title: "Orders needing attention", count: 6, desc: "Pending >48h or unpaid B2B", action: "Review queue" },
  { sev: "warn" as const, title: "Low stock", count: 7, desc: "At or below reorder point", action: "Reorder" },
  { sev: "warn" as const, title: "Overdue invoices", count: 3, desc: "Net 30+ past due", action: "AR workspace" },
  { sev: "info" as const, title: "Missing product cost", count: 14, desc: "SKUs without landed cost", action: "Fix costs" },
  { sev: "info" as const, title: "Pricing conflicts", count: 2, desc: "Override vs list price drift", action: "Resolve" },
  { sev: "info" as const, title: "Sync / import", count: 0, desc: "Last Fishbowl sync OK · 2h ago", action: "Logs" },
];

const activity = [
  { t: "2m", line: "Order #8821 placed · Metro Health · $4,120" },
  { t: "14m", line: "Inventory adjusted · GLV-500G-S · −24 qty" },
  { t: "1h", line: "PO #441 received · Hospeco · 120 cs" },
  { t: "2h", line: "Invoice #1904 paid · Acme Industrial · $8,900" },
  { t: "3h", line: "Product edited · Nitrile 6mil · margin 28% → 26%" },
  { t: "5h", line: "User invited · finance@glovebuyer.com" },
];

const quickActions = [
  { label: "Add customer", icon: "+" },
  { label: "Add product", icon: "▦" },
  { label: "Update pricing", icon: "%" },
  { label: "Create PO", icon: "▧" },
  { label: "Receive inventory", icon: "↓" },
  { label: "Export report", icon: "↓" },
  { label: "Invite user", icon: "◈" },
];

const topCustomers = [
  { name: "Metro Health Systems", rev: "$42,800", pct: 100 },
  { name: "Acme Industrial", rev: "$38,200", pct: 89 },
  { name: "Summit Food Service", rev: "$31,100", pct: 73 },
  { name: "Pacific Janitorial", rev: "$24,600", pct: 57 },
];

const categories = [
  { name: "Disposable nitrile", pct: 52 },
  { name: "Industrial work", pct: 28 },
  { name: "Vinyl / PE", pct: 12 },
  { name: "Other", pct: 8 },
];

const revSpark = [120, 132, 118, 145, 138, 156, 162, 148, 171, 165, 182, 188];
const ordSpark = [28, 31, 24, 35, 32, 38, 41, 36, 44, 40, 48, 45];
const marginSpark = [32.1, 31.8, 32.4, 31.2, 31.9, 31.4, 31.6, 31.3, 31.5, 31.4, 31.2, 31.4];

export function CockpitOverview() {
  return (
    <div className={cx("min-h-screen", text)} style={{ background: "#0d1117" }}>
      {/* —— Top bar —— */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-white/[0.06] bg-[#161b22] px-4">
        <div className="flex items-center gap-2 border-r border-white/[0.06] pr-4">
          <div className="h-7 w-7 rounded bg-[#e67a2e]/20 text-center text-sm leading-7 font-bold text-[#e67a2e]">G</div>
          <span className="text-xs font-semibold tracking-tight">Owner Cockpit</span>
        </div>
        <div className="relative flex-1 max-w-xl">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#6e7681]">⌕</span>
          <input
            type="search"
            placeholder="Search orders, SKUs, companies…"
            className="h-8 w-full rounded border border-white/[0.08] bg-[#0d1117] py-1 pl-8 pr-3 text-xs text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#e67a2e]/50 focus:outline-none focus:ring-1 focus:ring-[#e67a2e]/30"
          />
        </div>
        <button
          type="button"
          className="h-8 rounded bg-[#e67a2e] px-3 text-xs font-semibold text-white hover:bg-[#d96f28] active:opacity-95"
        >
          + Create
        </button>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] text-[#b1bac4] hover:bg-[#21262d]"
          aria-label="Notifications, 3 unread"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-80">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#f85149] px-0.5 text-[8px] font-bold text-white">
            3
          </span>
        </button>
        <div className="flex items-center gap-1.5 text-[10px] text-[#3fb950]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950]" />
          OK
        </div>
        <span className={cx("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", accentBg, accent)}>Owner</span>
        <div className="h-7 w-7 rounded-full bg-[#21262d] ring-1 ring-white/10" title="Profile" />
      </header>

      <div className="flex">
        {/* —— Sidebar —— */}
        <aside className="sticky top-12 h-[calc(100vh-3rem)] w-52 shrink-0 overflow-y-auto border-r border-white/[0.06] bg-[#161b22] py-2">
          <nav className="space-y-0.5 px-2">
            {navItems.map((item, i) => (
              <a
                key={item.label}
                href="#"
                className={cx(
                  "flex items-center gap-2.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
                  i === 0 ? "border-l-2 border-[#e67a2e] bg-[#e67a2e]/8 text-[#e6edf3]" : `${secondary} ${surfaceHover} border-l-2 border-transparent`,
                )}
              >
                <span className="w-3 text-center opacity-70">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="rounded bg-[#21262d] px-1.5 py-0 text-[9px] font-bold tabular-nums text-[#e67a2e]">{item.badge}</span>
                )}
              </a>
            ))}
          </nav>
        </aside>

        {/* —— Main —— */}
        <main className="min-w-0 flex-1 p-4 lg:p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[#e6edf3]">Overview</h1>
              <p className={cx("mt-0.5 text-[11px]", muted)}>Command center · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
            </div>
          </div>

          {/* A. Executive KPI strip */}
          <section className="mb-4">
            <p className={cx("mb-2 text-[10px] font-semibold uppercase tracking-widest", muted)}>Executive</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              {kpis.map((k) => (
                <a
                  key={k.label}
                  href={k.href}
                  className={cx("group rounded border p-2.5 transition-colors", surface, surfaceHover)}
                >
                  <div className="text-lg font-semibold tabular-nums tracking-tight text-[#e6edf3]">{k.value}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {k.trend && (
                      <span
                        className={cx(
                          "text-[10px] font-medium tabular-nums",
                          k.up === true && "text-[#3fb950]",
                          k.up === false && "text-[#f85149]",
                          k.up === null && muted,
                        )}
                      >
                        {k.trend}
                      </span>
                    )}
                    <span className={cx("text-[10px] opacity-0 transition-opacity group-hover:opacity-100", accent)}>→</span>
                  </div>
                  <div className={cx("mt-1.5 text-[10px] font-medium uppercase tracking-wide", muted)}>{k.label}</div>
                </a>
              ))}
            </div>
          </section>

          {/* B. Alert center */}
          <section className="mb-4">
            <p className={cx("mb-2 text-[10px] font-semibold uppercase tracking-widest", muted)}>Needs attention</p>
            <div className={cx("divide-y divide-white/[0.06] rounded border", surface)}>
              {alerts.map((a) => (
                <div
                  key={a.title}
                  className={cx(
                    "flex flex-wrap items-center gap-3 px-3 py-2.5",
                    a.sev === "danger" && "border-l-2 border-l-[#f85149]",
                    a.sev === "warn" && "border-l-2 border-l-[#d29922]",
                    a.sev === "info" && "border-l-2 border-l-[#58a6ff]/60",
                  )}
                >
                  <span className="min-w-[2rem] rounded bg-[#21262d] px-2 py-0.5 text-center text-xs font-bold tabular-nums text-[#e6edf3]">{a.count}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#e6edf3]">{a.title}</div>
                    <div className={cx("text-[11px]", muted)}>{a.desc}</div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-[#e67a2e]/40 bg-[#e67a2e]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#e67a2e] hover:bg-[#e67a2e]/20"
                  >
                    {a.action}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* C. Performance chart row */}
          <section className="mb-4">
            <p className={cx("mb-2 text-[10px] font-semibold uppercase tracking-widest", muted)}>Performance</p>
            <div className="grid gap-2 lg:grid-cols-5">
              {[
                { title: "Revenue trend", sub: "30d", spark: revSpark },
                { title: "Orders trend", sub: "30d", spark: ordSpark },
                { title: "Margin trend", sub: "% GM", spark: marginSpark },
              ].map((c) => (
                <div key={c.title} className={cx("rounded border p-3", surface)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b949e]">{c.title}</div>
                      <div className={cx("text-[10px]", muted)}>{c.sub}</div>
                    </div>
                    <span className="text-[10px] text-[#6e7681]">30D</span>
                  </div>
                  <div className="mt-2 text-[#e67a2e]">
                    <Sparkline data={c.spark} />
                  </div>
                </div>
              ))}
              <div className={cx("rounded border p-3 lg:col-span-1", surface)}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b949e]">Top customers</div>
                <ul className="mt-2 space-y-2">
                  {topCustomers.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-[11px]">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#21262d]">
                        <div className="h-full rounded-full bg-[#6e7681]" style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className="w-24 truncate text-[#b1bac4]">{c.name}</span>
                      <span className="w-16 text-right tabular-nums text-[#e6edf3]">{c.rev}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cx("rounded border p-3 lg:col-span-1", surface)}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8b949e]">Category mix</div>
                <ul className="mt-3 space-y-1.5">
                  {categories.map((c) => (
                    <li key={c.name} className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-[#b1bac4]">{c.name}</span>
                      <span className="tabular-nums text-[#e6edf3]">{c.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-5">
            {/* D. Inventory intelligence */}
            <section className={cx("xl:col-span-3 rounded border", surface)}>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8b949e]">Inventory intelligence</span>
                <div className="flex gap-1">
                  {["Low stock", "Reorder", "Velocity"].map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      className={cx(
                        "rounded px-2 py-0.5 text-[10px] font-medium",
                        i === 0 ? "bg-[#21262d] text-[#e6edf3]" : "text-[#6e7681] hover:text-[#b1bac4]",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-wide text-[#6e7681]">
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">On hand</th>
                      <th className="px-3 py-2 text-right">ROP</th>
                      <th className="px-3 py-2">Velocity</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className={secondary}>
                    {[
                      { sku: "GLV-500G-M", name: "Nitrile 5mil M", oh: 240, rop: 400, v: "Fast" },
                      { sku: "GLV-102", name: "Vinyl L", oh: 80, rop: 200, v: "Slow" },
                      { sku: "NG-400", name: "Industrial XL", oh: 12, rop: 48, v: "Fast" },
                    ].map((r) => (
                      <tr key={r.sku} className="border-b border-white/[0.04] hover:bg-[#1c2128]">
                        <td className="px-3 py-2 font-mono text-[10px] text-[#8b949e]">{r.sku}</td>
                        <td className="px-3 py-2 text-[#e6edf3]">{r.name}</td>
                        <td className={cx("px-3 py-2 text-right tabular-nums", r.oh <= r.rop && "font-semibold text-[#f85149]")}>{r.oh}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.rop}</td>
                        <td className="px-3 py-2">
                          <span className={cx("rounded px-1.5 py-0 text-[9px] font-bold uppercase", r.v === "Fast" ? "bg-[#238636]/20 text-[#3fb950]" : "bg-[#21262d] text-[#6e7681]")}>{r.v}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" className="text-[10px] font-semibold text-[#e67a2e] hover:underline">
                            PO
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={cx("flex flex-wrap gap-4 border-t border-white/[0.06] px-3 py-2 text-[11px]", muted)}>
                <span>
                  Stock value est. <strong className="tabular-nums text-[#e6edf3]">$1.24M</strong>
                </span>
                <span>·</span>
                <span>Reorder suggestions: 5 SKUs</span>
              </div>
            </section>

            {/* E. Activity feed */}
            <section className={cx("xl:col-span-2 rounded border", surface)}>
              <div className="border-b border-white/[0.06] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8b949e]">Recent activity</span>
              </div>
              <ul className="max-h-[280px] divide-y divide-white/[0.04] overflow-y-auto">
                {activity.map((a) => (
                  <li key={a.t + a.line} className="flex gap-2 px-3 py-2 hover:bg-[#1c2128]/80">
                    <span className="w-8 shrink-0 font-mono text-[10px] text-[#6e7681]">{a.t}</span>
                    <span className="text-[11px] leading-snug text-[#b1bac4]">{a.line}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* F. Quick actions */}
          <section className="mt-4">
            <p className={cx("mb-2 text-[10px] font-semibold uppercase tracking-widest", muted)}>Quick actions</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {quickActions.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className={cx(
                    "flex flex-col items-center gap-1.5 rounded border py-3 text-center transition-colors",
                    surface,
                    surfaceHover,
                  )}
                >
                  <span className="text-sm text-[#8b949e]">{q.icon}</span>
                  <span className="text-[10px] font-medium text-[#b1bac4]">{q.label}</span>
                </button>
              ))}
            </div>
          </section>

          <p className={cx("mt-8 text-center text-[10px]", muted)}>Preview · GloveCubs Owner Cockpit design reference</p>
        </main>
      </div>
    </div>
  );
}
