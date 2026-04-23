import { redirect } from "next/navigation";

/**
 * Deep link: /dashboard/review/[id] opens the Review queue with the staged product detail sheet.
 */
export default async function ReviewStagingIdPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  redirect(`/dashboard/review?id=${encodeURIComponent(id)}`);
}
