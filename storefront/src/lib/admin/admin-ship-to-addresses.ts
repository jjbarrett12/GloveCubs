import type { SupabaseClient } from "@supabase/supabase-js";

/** JSONB contract v1 — persisted on `gc_commerce.ship_to_addresses.address` */
export type ShipToAddressJsonV1 = {
  _v: 1;
  recipient_name: string;
  company_name?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  region: string;
  postal_code: string;
  country_code: string;
  phone?: string;
  delivery_notes?: string;
  is_archived: boolean;
};

export type AdminShipToAddressRow = {
  id: string;
  company_id: string;
  created_by_user_id: string;
  label: string | null;
  address: ShipToAddressJsonV1;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ShipToAddressFormInput = {
  label?: string | null;
  recipient_name: string;
  company_name?: string | null;
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  region: string;
  postal_code: string;
  country_code: string;
  phone?: string | null;
  delivery_notes?: string | null;
  /** When true, persisted as `address.is_archived` */
  is_archived?: boolean;
};

function trimOrEmpty(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).trim();
}

function omitEmptyOptional<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === "" || v === null || v === undefined) {
      delete out[k as keyof T];
    }
  }
  return out;
}

/**
 * Validates and normalizes address fields into `ShipToAddressJsonV1`.
 * Does not persist. Optional keys are omitted when empty.
 */
export function normalizeShipToAddressInput(
  input: ShipToAddressFormInput,
): { ok: true; address: ShipToAddressJsonV1 } | { ok: false; error: string } {
  const recipient_name = trimOrEmpty(input.recipient_name);
  const address_line_1 = trimOrEmpty(input.address_line_1);
  const city = trimOrEmpty(input.city);
  const region = trimOrEmpty(input.region);
  const postal_code = trimOrEmpty(input.postal_code);
  let country_code = trimOrEmpty(input.country_code).toUpperCase();
  if (!country_code) country_code = "US";

  if (!recipient_name) return { ok: false, error: "recipient_name is required" };
  if (!address_line_1) return { ok: false, error: "address_line_1 is required" };
  if (!city) return { ok: false, error: "city is required" };
  if (!region) return { ok: false, error: "region is required" };
  if (!postal_code) return { ok: false, error: "postal_code is required" };
  if (!country_code || country_code.length !== 2) {
    return { ok: false, error: "country_code must be a 2-letter ISO code" };
  }

  const company_name = trimOrEmpty(input.company_name);
  const address_line_2 = trimOrEmpty(input.address_line_2);
  const phone = trimOrEmpty(input.phone);
  let delivery_notes = trimOrEmpty(input.delivery_notes);
  if (delivery_notes.length > 500) {
    return { ok: false, error: "delivery_notes must be at most 500 characters" };
  }

  const base: Record<string, unknown> = {
    _v: 1,
    recipient_name,
    address_line_1,
    city,
    region,
    postal_code,
    country_code,
    is_archived: Boolean(input.is_archived),
  };

  const withOptionals = omitEmptyOptional({
    ...base,
    company_name: company_name || undefined,
    address_line_2: address_line_2 || undefined,
    phone: phone || undefined,
    delivery_notes: delivery_notes || undefined,
  });

  return { ok: true, address: withOptionals as unknown as ShipToAddressJsonV1 };
}

/** Validates persisted address JSONB from `gc_commerce.ship_to_addresses.address`. */
export function tryParsePersistedShipToAddressJson(raw: unknown): ShipToAddressJsonV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o._v !== 1) return null;
  const n = normalizeShipToAddressInput({
    recipient_name: trimOrEmpty(o.recipient_name),
    company_name: trimOrEmpty(o.company_name),
    address_line_1: trimOrEmpty(o.address_line_1),
    address_line_2: trimOrEmpty(o.address_line_2),
    city: trimOrEmpty(o.city),
    region: trimOrEmpty(o.region),
    postal_code: trimOrEmpty(o.postal_code),
    country_code: trimOrEmpty(o.country_code),
    phone: trimOrEmpty(o.phone),
    delivery_notes: trimOrEmpty(o.delivery_notes),
    is_archived: Boolean(o.is_archived),
  });
  if (!n.ok) return null;
  return n.address;
}

export async function fetchAdminShipToAddresses(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ rows: AdminShipToAddressRow[]; error: string | null }> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .select("id, company_id, created_by_user_id, label, address, is_default, created_at, updated_at")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("label", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: AdminShipToAddressRow[] = [];
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const addr = tryParsePersistedShipToAddressJson(row.address);
    if (!addr) continue;
    rows.push({
      id: String(row.id),
      company_id: String(row.company_id),
      created_by_user_id: String(row.created_by_user_id),
      label: row.label === null || row.label === undefined ? null : String(row.label),
      address: addr,
      is_default: Boolean(row.is_default),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    });
  }

  return { rows, error: null };
}

export async function createAdminShipToAddress(
  supabase: SupabaseClient,
  companyId: string,
  adminUserId: string,
  input: ShipToAddressFormInput,
): Promise<{ row: AdminShipToAddressRow | null; error: string | null; code?: "validation" | "db" }> {
  const normalized = normalizeShipToAddressInput(input);
  if (!normalized.ok) {
    return { row: null, error: normalized.error, code: "validation" };
  }

  const label = trimOrEmpty(input.label) || null;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .insert({
      company_id: companyId,
      created_by_user_id: adminUserId,
      label,
      address: normalized.address as unknown as Record<string, unknown>,
      is_default: false,
      created_at: now,
      updated_at: now,
    })
    .select("id, company_id, created_by_user_id, label, address, is_default, created_at, updated_at")
    .single();

  if (error) {
    return { row: null, error: error.message, code: "db" };
  }

  const addr = tryParsePersistedShipToAddressJson((data as { address?: unknown }).address);
  if (!data || !addr) {
    return { row: null, error: "Insert returned invalid row", code: "db" };
  }

  const d = data as Record<string, unknown>;
  return {
    row: {
      id: String(d.id),
      company_id: String(d.company_id),
      created_by_user_id: String(d.created_by_user_id),
      label: d.label == null ? null : String(d.label),
      address: addr,
      is_default: Boolean(d.is_default),
      created_at: String(d.created_at),
      updated_at: String(d.updated_at),
    },
    error: null,
  };
}

export async function updateAdminShipToAddress(
  supabase: SupabaseClient,
  companyId: string,
  addressId: string,
  patch: Partial<ShipToAddressFormInput>,
): Promise<{
  row: AdminShipToAddressRow | null;
  error: string | null;
  code?: "validation" | "not_found" | "conflict" | "db";
}> {
  const { data: existing, error: fetchErr } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .select("id, label, address, is_default")
    .eq("id", addressId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchErr) {
    return { row: null, error: fetchErr.message, code: "db" };
  }
  if (!existing) {
    return { row: null, error: "Address not found", code: "not_found" };
  }

  const ex = existing as { label: string | null; address: unknown; is_default: boolean };
  const current = tryParsePersistedShipToAddressJson(ex.address);
  if (!current) {
    return { row: null, error: "Existing address record is invalid", code: "validation" };
  }

  if (current.is_archived && patch.is_archived === false) {
    return {
      row: null,
      error: "Archived ship-to addresses cannot be unarchived in this phase.",
      code: "conflict",
    };
  }

  const merged: ShipToAddressFormInput = {
    label: patch.label !== undefined ? patch.label : ex.label,
    recipient_name: patch.recipient_name !== undefined ? patch.recipient_name : current.recipient_name,
    company_name: patch.company_name !== undefined ? patch.company_name : current.company_name ?? null,
    address_line_1: patch.address_line_1 !== undefined ? patch.address_line_1 : current.address_line_1,
    address_line_2: patch.address_line_2 !== undefined ? patch.address_line_2 : current.address_line_2 ?? null,
    city: patch.city !== undefined ? patch.city : current.city,
    region: patch.region !== undefined ? patch.region : current.region,
    postal_code: patch.postal_code !== undefined ? patch.postal_code : current.postal_code,
    country_code: patch.country_code !== undefined ? patch.country_code : current.country_code,
    phone: patch.phone !== undefined ? patch.phone : current.phone ?? null,
    delivery_notes: patch.delivery_notes !== undefined ? patch.delivery_notes : current.delivery_notes ?? null,
    is_archived: current.is_archived ? true : patch.is_archived !== undefined ? patch.is_archived : current.is_archived,
  };

  const normalized = normalizeShipToAddressInput(merged);
  if (!normalized.ok) {
    return { row: null, error: normalized.error, code: "validation" };
  }

  let nextDefault = ex.is_default;
  if (normalized.address.is_archived && ex.is_default) {
    nextDefault = false;
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    address: normalized.address as unknown as Record<string, unknown>,
    updated_at: now,
  };
  if (patch.label !== undefined) {
    updatePayload.label = trimOrEmpty(patch.label) || null;
  }
  if (nextDefault !== ex.is_default) {
    updatePayload.is_default = nextDefault;
  }

  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .update(updatePayload)
    .eq("id", addressId)
    .eq("company_id", companyId)
    .select("id, company_id, created_by_user_id, label, address, is_default, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message, code: "db" };
  }
  if (!data) {
    return { row: null, error: "Address not found", code: "not_found" };
  }

  const addr = tryParsePersistedShipToAddressJson((data as { address?: unknown }).address);
  if (!addr) {
    return { row: null, error: "Updated row has invalid address", code: "db" };
  }

  const d = data as Record<string, unknown>;
  return {
    row: {
      id: String(d.id),
      company_id: String(d.company_id),
      created_by_user_id: String(d.created_by_user_id),
      label: d.label == null ? null : String(d.label),
      address: addr,
      is_default: Boolean(d.is_default),
      created_at: String(d.created_at),
      updated_at: String(d.updated_at),
    },
    error: null,
  };
}

export async function archiveAdminShipToAddress(
  supabase: SupabaseClient,
  companyId: string,
  addressId: string,
): Promise<{
  row: AdminShipToAddressRow | null;
  error: string | null;
  code?: "validation" | "not_found" | "conflict" | "db";
}> {
  return updateAdminShipToAddress(supabase, companyId, addressId, { is_archived: true });
}

export async function setDefaultAdminShipToAddress(
  supabase: SupabaseClient,
  companyId: string,
  addressId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: "not_found" | "conflict" | "db" }> {
  const { data: target, error: tErr } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .select("id, address")
    .eq("id", addressId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (tErr) {
    return { ok: false, error: tErr.message, code: "db" };
  }
  if (!target) {
    return { ok: false, error: "Address not found", code: "not_found" };
  }

  const addr = tryParsePersistedShipToAddressJson((target as { address: unknown }).address);
  if (!addr) {
    return { ok: false, error: "Address record is invalid", code: "db" };
  }
  if (addr.is_archived) {
    return { ok: false, error: "Cannot set an archived address as default", code: "conflict" };
  }

  const now = new Date().toISOString();

  const { error: clearErr } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .update({ is_default: false, updated_at: now })
    .eq("company_id", companyId);

  if (clearErr) {
    return { ok: false, error: clearErr.message, code: "db" };
  }

  const { error: setErr } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .update({ is_default: true, updated_at: now })
    .eq("id", addressId)
    .eq("company_id", companyId);

  if (setErr) {
    return { ok: false, error: setErr.message, code: "db" };
  }

  return { ok: true };
}
