"use server";

import { revalidatePath } from "next/cache";
import { createSupplier as createSupplierService } from "@/lib/catalogos/suppliers";

export interface CreateSupplierResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function createSupplier(formData: FormData): Promise<CreateSupplierResult> {
  const name = formData.get("name")?.toString()?.trim();
  const slug = formData.get("slug")?.toString()?.trim();
  if (!name || !slug) return { success: false, error: "Name and slug are required" };
  try {
    const { id } = await createSupplierService({ name, slug });
    revalidatePath("/dashboard/suppliers");
    revalidatePath("/dashboard/feeds");
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create supplier" };
  }
}
