import Link from "next/link";
import { adminFocusRing } from "@/components/admin/admin-theme-utils";
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
}: {
  activeTab: string | undefined;
  variant?: "default" | "dark";
}) {
  return (
    <div
      className="mb-6 flex flex-wrap gap-1 rounded-xl border border-admin-border bg-admin-surface-muted p-1 shadow-sm"
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
              adminFocusRing(),
              active
                ? "bg-admin-accent text-white shadow-sm"
                : "text-admin-muted hover:bg-admin-surface hover:text-admin-primary",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
