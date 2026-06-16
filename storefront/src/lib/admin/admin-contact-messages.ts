import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AdminContactMessageRow = {
  id: number;
  name: string;
  email: string;
  company: string;
  message: string;
  created_at: string;
};

export async function fetchAdminContactMessages(): Promise<{
  rows: AdminContactMessageRow[];
  error: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: AdminContactMessageRow[] = (data ?? []).map((r) => {
    const raw = r as { id: number; payload: unknown; created_at: string };
    const p = raw.payload && typeof raw.payload === "object" ? (raw.payload as Record<string, unknown>) : {};
    return {
      id: raw.id,
      name: typeof p.name === "string" ? p.name : "",
      email: typeof p.email === "string" ? p.email : "",
      company: typeof p.company === "string" ? p.company : "",
      message: typeof p.message === "string" ? p.message : "",
      created_at: raw.created_at,
    };
  });

  return { rows, error: null };
}
