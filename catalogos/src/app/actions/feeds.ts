"use server";

import { revalidatePath } from "next/cache";
import { createFeed } from "@/lib/catalogos/feeds";

export interface CreateFeedResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function createFeedAction(formData: FormData): Promise<CreateFeedResult> {
  const supplierId = formData.get("supplier_id")?.toString()?.trim();
  const feedType = formData.get("feed_type")?.toString()?.trim() as "url" | "csv" | "api" | undefined;
  const feedUrl = formData.get("feed_url")?.toString()?.trim();
  if (!supplierId || !feedType) return { success: false, error: "Supplier and feed type are required" };
  if ((feedType === "url" || feedType === "csv") && !feedUrl) return { success: false, error: "Feed URL is required for url/csv" };
  const config = feedUrl ? { url: feedUrl } : {};
  try {
    const { id } = await createFeed({
      supplier_id: supplierId,
      feed_type: feedType,
      config,
    });
    revalidatePath("/dashboard/feeds");
    revalidatePath("/dashboard/suppliers");
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create feed" };
  }
}
