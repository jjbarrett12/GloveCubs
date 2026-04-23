import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadById, getLeadContacts } from "@/lib/discovery/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadActions } from "./LeadActions";

export default async function DiscoveryLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, contacts] = await Promise.all([getLeadById(id), getLeadContacts(id)]);
  if (!lead) notFound();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/discovery/leads" className="text-sm text-muted-foreground hover:text-foreground">← Leads</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lead.company_name}</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">{lead.domain ?? "No domain"}</p>
        </div>
        <Badge variant={lead.status === "onboarded" ? "default" : lead.status === "rejected" ? "destructive" : "secondary"}>
          {lead.status}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Website:</span> {lead.website ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lead.website}</a> : "—"}</p>
          <p><span className="text-muted-foreground">Source URL:</span> {lead.source_url ?? "—"}</p>
          <p><span className="text-muted-foreground">Discovery method:</span> {lead.discovery_method}</p>
          <p><span className="text-muted-foreground">Lead score:</span> {lead.lead_score}</p>
          <p><span className="text-muted-foreground">Signals:</span> API {lead.api_signal ? "✓" : "—"} CSV {lead.csv_signal ? "✓" : "—"} PDF {lead.pdf_catalog_signal ? "✓" : "—"}</p>
          {lead.product_categories?.length > 0 && (
            <p><span className="text-muted-foreground">Categories:</span> {lead.product_categories.join(", ")}</p>
          )}
          {lead.notes && <p><span className="text-muted-foreground">Notes:</span> {lead.notes}</p>}
          {lead.promoted_supplier_id && (
            <p>
              <span className="text-muted-foreground">Promoted to supplier:</span>{" "}
              <Link href={`/dashboard/suppliers`} className="text-primary hover:underline">View supplier</Link>
            </p>
          )}
        </CardContent>
      </Card>

      {contacts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {contacts.map((c) => (
                <li key={c.id}>
                  {c.contact_name && <span className="font-medium">{c.contact_name}</span>}
                  {c.contact_email && <span className="text-muted-foreground"> {c.contact_email}</span>}
                  {c.phone && <span className="text-muted-foreground"> {c.phone}</span>}
                  {c.is_primary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <LeadActions leadId={lead.id} status={lead.status} promotedSupplierId={lead.promoted_supplier_id} />
    </div>
  );
}
