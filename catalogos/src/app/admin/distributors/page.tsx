import { listDistributorSources, listCrawlJobs, getCrawlJobDetail } from "@/lib/distributor-sync/admin-data";
import { StartCrawlForm } from "./StartCrawlForm";
import { DistributorSourcesSection } from "./DistributorSourcesSection";
import { CrawlJobsSection } from "./CrawlJobsSection";
import { CrawlResultsSection } from "./CrawlResultsSection";
import { PublishSection } from "./PublishSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = { searchParams: Promise<{ job?: string }> };

export default async function AdminDistributorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const jobId = params.job?.trim() || null;

  let sources: Awaited<ReturnType<typeof listDistributorSources>>;
  let jobs: Awaited<ReturnType<typeof listCrawlJobs>>;
  let jobDetail: Awaited<ReturnType<typeof getCrawlJobDetail>> = null;

  try {
    [sources, jobs] = await Promise.all([
      listDistributorSources(),
      listCrawlJobs(50),
    ]);
    if (jobId) {
      jobDetail = await getCrawlJobDetail(jobId);
    }
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Distributors</h1>
        <p className="text-destructive">
          Failed to load. Ensure catalogos schema and distributor tables exist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Distributors</h1>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Distributor Sources</h2>
        <DistributorSourcesSection sources={sources} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Start Crawl</h2>
        <StartCrawlForm />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Crawl Jobs</h2>
        <CrawlJobsSection jobs={jobs} />
      </section>

      {jobDetail && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Crawl Results</h2>
          <CrawlResultsSection
            jobId={jobDetail.job.id}
            staging={jobDetail.staging}
            failedPages={jobDetail.failedPages}
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Publish</h2>
        <PublishSection />
      </section>
    </div>
  );
}
