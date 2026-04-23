-- Tenant scope: link suppliers to an organization UUID (application-enforced; no public.organizations FK).

ALTER TABLE catalogos.suppliers
  ADD COLUMN IF NOT EXISTS organization_id UUID;

CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id
  ON catalogos.suppliers (organization_id)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN catalogos.suppliers.organization_id IS
  'Owning organization for access control; supplier import APIs require a match with X-Catalogos-Organization-Id.';
