import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs: { id: string | null; label: string; href: string }[] = [
  { id: null, label: "All", href: "/admin/products" },
  { id: "products", label: "Products", href: "/admin/products?tab=products" },
  { id: "drafts", label: "Drafts", href: "/admin/products?tab=drafts" },
  { id: "url-imports", label: "Clipboard URLs", href: "/admin/products?tab=url-imports" },
  { id: "needs-review", label: "Needs review", href: "/admin/products?tab=needs-review" },
  { id: "archived", label: "Archived", href: "/admin/products?tab=archived" },
];

export function ProductsWorkspaceTabs({
  activeTab,
  variant = "default",
}: {
  activeTab: string | undefined;
  variant?: "default" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap gap-1 rounded-xl border p-1 shadow-sm",
        dark ? "border-white/10 bg-[#141414]" : "border-slate-200/90 bg-slate-100/80",
      )}
      role="tablist"
      aria-label="Product workspace"
    >
      {tabs.map((t) => {
        const active = t.id === null ? activeTab === undefined : activeTab === t.id;
        return (
          <Link
            key={t.label}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-2 text-sm font-medium transition",
              dark
                ? active
                  ? "bg-[#f06232] text-white shadow-sm"
                  : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                : active
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
