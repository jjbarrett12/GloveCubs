'use client';

/**
 * Admin Ingestion entry — operational console lives in CatalogOS.
 * Links to CatalogOS dashboard ingestion for batch review and publish.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const CATALOGOS_BASE = process.env.NEXT_PUBLIC_CATALOGOS_URL ?? null;
const CATALOGOS_INGESTION_URL = CATALOGOS_BASE ? `${CATALOGOS_BASE}/dashboard/ingestion` : null;
const CATALOGOS_CSV_IMPORT_URL = CATALOGOS_BASE ? `${CATALOGOS_BASE}/dashboard/csv-import` : null;
const CATALOGOS_URL_IMPORT_URL = CATALOGOS_BASE ? `${CATALOGOS_BASE}/dashboard/url-import` : null;

export default function AdminIngestionPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-4">Ingestion Console</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch ingest, review, and publish</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The operational ingestion console (batches, review queue, bulk approve/reject, publish) runs in CatalogOS.
          </p>
          {CATALOGOS_INGESTION_URL ? (
            <div className="flex flex-wrap gap-2">
              <a href={CATALOGOS_CSV_IMPORT_URL ?? CATALOGOS_INGESTION_URL} target="_blank" rel="noopener noreferrer">
                <Button>CSV import (CatalogOS)</Button>
              </a>
              <a href={CATALOGOS_URL_IMPORT_URL ?? CATALOGOS_INGESTION_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">URL import (CatalogOS)</Button>
              </a>
              <a href={CATALOGOS_INGESTION_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Ingestion console</Button>
              </a>
            </div>
          ) : (
            <p className="text-sm text-amber-600">
              Set <code className="bg-muted px-1 rounded">NEXT_PUBLIC_CATALOGOS_URL</code> to link to the console.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
