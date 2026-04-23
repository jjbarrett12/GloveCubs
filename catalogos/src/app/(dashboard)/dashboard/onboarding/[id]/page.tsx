import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOnboardingRequestById,
  getOnboardingSteps,
  getOnboardingFiles,
} from "@/lib/onboarding/requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OnboardingActions } from "./OnboardingActions";
import { FileDownloadLink } from "./FileDownloadLink";
import { RequestMoreInfoCard } from "./RequestMoreInfoCard";
import type { ContactInfo } from "@/lib/onboarding/types";

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, steps, files] = await Promise.all([
    getOnboardingRequestById(id),
    getOnboardingSteps(id),
    getOnboardingFiles(id),
  ]);
  if (!request) notFound();

  const contact = request.contact_info as ContactInfo;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/onboarding" className="text-sm text-muted-foreground hover:text-foreground">
          ← Onboarding
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{request.company_name}</h1>
          <p className="text-muted-foreground text-sm mt-1">{request.website ?? "No website"}</p>
        </div>
        <div className="flex items-center gap-2">
          {(request as { submitted_via?: string }).submitted_via === "supplier_portal" && (
            <Badge variant="outline">Supplier portal</Badge>
          )}
          <Badge
            variant={
              request.status === "completed"
                ? "default"
                : request.status === "rejected"
                  ? "destructive"
                  : "secondary"
            }
          >
            {request.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Contact:</span>{" "}
            {contact?.contact_name ?? "—"} {contact?.contact_email && `(${contact.contact_email})`}{" "}
            {contact?.phone ?? ""}
          </p>
          <p>
            <span className="text-muted-foreground">Feed type:</span> {request.feed_type ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Feed URL:</span>{" "}
            {request.feed_url ? (
              <a href={request.feed_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {request.feed_url}
              </a>
            ) : (
              "—"
            )}
          </p>
          {request.pricing_basis_hints && (
            <p>
              <span className="text-muted-foreground">Pricing hints:</span> {request.pricing_basis_hints}
            </p>
          )}
          {request.packaging_hints && (
            <p>
              <span className="text-muted-foreground">Packaging hints:</span> {request.packaging_hints}
            </p>
          )}
          {request.categories_supplied?.length > 0 && (
            <p>
              <span className="text-muted-foreground">Categories:</span> {request.categories_supplied.join(", ")}
            </p>
          )}
          {request.notes && (
            <p>
              <span className="text-muted-foreground">Notes:</span> {request.notes}
            </p>
          )}
          {request.created_supplier_id && (
            <p>
              <span className="text-muted-foreground">Supplier:</span>{" "}
              <Link href="/dashboard/suppliers" className="text-primary hover:underline">
                View supplier
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Files</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  {f.filename} {f.file_kind && <Badge variant="outline" className="ml-2">{f.file_kind}</Badge>}
                  <FileDownloadLink requestId={request.id} fileId={f.id} filename={f.filename} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {steps.length === 0 ? (
            <div className="p-4 text-muted-foreground text-sm">No steps yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {steps.map((s) => (
                <li key={s.id} className="px-4 py-2 text-sm flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{s.step_type}</span>
                  {s.payload && typeof s.payload === "object" && Object.keys(s.payload).length > 0 && (
                    <span className="text-muted-foreground">
                      {JSON.stringify(s.payload)}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RequestMoreInfoCard requestId={request.id} status={request.status} />

      <OnboardingActions request={request} />
    </div>
  );
}
