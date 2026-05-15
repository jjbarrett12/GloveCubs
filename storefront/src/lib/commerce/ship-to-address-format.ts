import { tryParsePersistedShipToAddressJson, type ShipToAddressJsonV1 } from "@/lib/admin/admin-ship-to-addresses";

function trimOrEmpty(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).trim();
}

/** One-line summary from immutable quote snapshot JSONB (or live-shaped JSON). */
export function formatShipToOneLine(snapshot: unknown): string {
  const a = tryParsePersistedShipToAddressJson(snapshot);
  if (!a) return "—";
  return formatShipToAddressJsonOneLine(a);
}

function formatShipToAddressJsonOneLine(a: ShipToAddressJsonV1): string {
  const p2 = a.address_line_2 ? `, ${a.address_line_2}` : "";
  return `${a.address_line_1}${p2}, ${a.city}, ${a.region} ${a.postal_code}, ${a.country_code}`;
}

/** Prefer saved label; fall back to one-line address from snapshot. */
export function formatShipToLabel(label: string | null | undefined, snapshot: unknown): string {
  const line = formatShipToOneLine(snapshot);
  const lt = trimOrEmpty(label);
  if (lt) return `${lt} · ${line}`;
  return line;
}
