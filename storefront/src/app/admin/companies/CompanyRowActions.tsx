"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  companyId: string;
};

export function CompanyRowActions({ companyId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Actions
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            <Link
              href={`/admin/companies/${companyId}`}
              className="block px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              View / Edit
            </Link>
            <Link
              href={`/admin/procurement/company/${companyId}`}
              className="block px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Sourcing
            </Link>
            <Link
              href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
              className="block px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Order records
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
