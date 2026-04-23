-- Add image_enrichment phase to supplier import job lifecycle (between variant grouping and review).
DO $mig$
BEGIN
  ALTER TYPE catalogos.supplier_import_job_status ADD VALUE 'image_enrichment';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$mig$;
