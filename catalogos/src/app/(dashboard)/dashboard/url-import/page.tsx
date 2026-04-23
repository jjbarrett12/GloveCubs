import { listUrlImportJobs } from "@/lib/url-import/admin-data";
import { UrlImportClient } from "./UrlImportClient";

export default async function UrlImportPage() {
  let initialJobs: Awaited<ReturnType<typeof listUrlImportJobs>> = [];
  try {
    initialJobs = await listUrlImportJobs(50);
  } catch {
    // show empty list
  }
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">URL import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a manufacturer or distributor category URL to crawl, extract products, infer families/variants, and stage for review.
        </p>
      </div>
      <UrlImportClient initialJobs={initialJobs} />
    </div>
  );
}
