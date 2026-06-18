import { cn } from "@/lib/utils";
import {
  adminTableBody,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
  adminTableShell,
} from "@/components/admin/admin-theme-utils";

type Props = {
  headers: { label: string; align?: "left" | "right" }[];
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
};

/** Tokenized table shell for procurement detail pages (server-rendered rows). */
export function ProcurementTableShell({ headers, children, className, minWidth }: Props) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className={cn(adminTableShell, minWidth)}>
        <thead className={adminTableHead}>
          <tr>
            {headers.map((h) => (
              <th
                key={h.label}
                className={cn(adminTableHeadCell, "px-3 py-2", h.align === "right" && "text-right")}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={adminTableBody}>{children}</tbody>
      </table>
    </div>
  );
}

export { adminTableRowHover };
