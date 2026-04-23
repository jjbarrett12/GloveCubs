import { notFound } from "next/navigation";
import { getOnboardingRequestByAccessToken } from "@/lib/onboarding/requests";
import { getOnboardingFiles } from "@/lib/onboarding/requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SupplierStatusUpdateForm } from "./SupplierStatusUpdateForm";

const STATUS_LABELS: Record<string, string> = {
  initiated: "Received",
  waiting_for_supplier: "We need more information",
  ready_for_review: "Under review",
  approved: "Approved",
  created_supplier: "Supplier created",
  feed_created: "Feed created",
  ingestion_triggered: "Catalog import started",
  completed: "Completed",
  rejected: "Declined",
};

export default async function SupplierStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = await getOnboardingRequestByAccessToken(token);
  if (!request) notFound();

  const files = await getOnboardingFiles(request.id);
  const contact = request.contact_info as { contact_name?: string; contact_email?: string; phone?: string } | undefined;
  const statusLabel = STATUS_LABELS[request.status] ?? request.status.replace(/_/g, " ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding status</h1>
        <p className="text-muted-foreground text-sm mt-1">{request.company_name}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Status
            <Badge variant={request.status === "rejected" ? "destructive" : "secondary"}>
              {statusLabel}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {request.status === "waiting_for_supplier" && request.requested_info_notes && (
            <div className="rounded-md bg-muted p-3">
              <p className="font-medium text-foreground mb-1">Information we need:</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{request.requested_info_notes}</p>
            </div>
          )}
          <p>
            <span className="text-muted-foreground">Contact:</span>{" "}
            {contact?.contact_name ?? "—"} {contact?.contact_email && `(${contact.contact_email})`}{" "}
            {contact?.phone ?? ""}
          </p>
          <p>
            <span className="text-muted-foreground">Feed:</span> {request.feed_type ?? "—"}{" "}
            {request.feed_url && (
              <a href={request.feed_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {request.feed_url}
              </a>
            )}
          </p>
        </CardContent>
      </Card>

      {request.status === "waiting_for_supplier" && (
        <SupplierStatusUpdateForm token={token} requestId={request.id} files={files} />
      )}

      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Uploaded files</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {files.map((f) => (
                <li key={f.id}>
                  {f.filename}
                  {f.file_kind && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {f.file_kind}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
