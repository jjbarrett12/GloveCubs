/**

 * Documents post-active side-effect parity: storefront manual save vs CatalogOS runPublish.

 */

import { readFileSync } from "node:fs";

import { join } from "node:path";

import { describe, expect, it } from "vitest";



const PRODUCT_WRITE = readFileSync(join(__dirname, "product-write.ts"), "utf8");

const POST_ACTIVE = readFileSync(join(__dirname, "product-write-manual-post-active.ts"), "utf8");

const EDITOR_ACTIONS = readFileSync(

  join(__dirname, "../../app/admin/products/_components/product-editor-actions.ts"),

  "utf8"

);



describe("storefront manual active publish side-effect policy", () => {

  it("product-write active save uses manual post-active helper and does not invoke CatalogOS runPublish", () => {

    expect(PRODUCT_WRITE).toContain("evaluateActivePublishReadiness");

    expect(PRODUCT_WRITE).toContain("runManualPostActiveSideEffects");

    expect(PRODUCT_WRITE).toContain("finalizeManualActivePublish");

    expect(PRODUCT_WRITE).not.toMatch(/\brunPublish\b/);

    expect(PRODUCT_WRITE).not.toContain("publish-service");

  });



  it("product-write does not import CatalogOS publish-service directly", () => {

    expect(PRODUCT_WRITE).not.toContain("publish-service");

    expect(PRODUCT_WRITE).not.toContain("evaluatePublishReadiness");

    expect(PRODUCT_WRITE).not.toContain("finalizePublishSearchSync");

    expect(PRODUCT_WRITE).not.toContain("syncCommercePackagingToCatalogV2Metadata");

  });



  it("manual post-active helper uses approved side effects only", () => {

    expect(POST_ACTIVE).toContain("refreshProductAttributesJsonSnapshot");

    expect(POST_ACTIVE).toContain("buildSupplierOfferUpsertRow");

    expect(POST_ACTIVE).not.toMatch(/\brunPublish\s*\(/);

    expect(POST_ACTIVE).not.toContain("publish-service");

    expect(POST_ACTIVE).not.toContain("publish_events");

  });



  it("manual post-active helper allows URL-import after admin review", () => {

    expect(POST_ACTIVE).toContain("shouldRunManualPostActiveSideEffects");

  });



  it("product-write does sync editor-owned catalog rows used by storefront manual path", () => {

    expect(PRODUCT_WRITE).toContain("syncProductAttributesFromEditor");

    expect(PRODUCT_WRITE).toContain("syncProductImages");

    expect(PRODUCT_WRITE).toContain("applyCommercePackagingToMetadata");

    expect(PRODUCT_WRITE).toContain("catalog_variants");

  });



  it("URL-import catalog products publish through admin review editor, not staging promote", () => {

    expect(PRODUCT_WRITE).toContain("importStagingId");

    expect(PRODUCT_WRITE).toContain("evaluateActivePublishReadiness");

    expect(PRODUCT_WRITE).toMatch(/importStagingId\?\.trim\(\)\s*\?\s*"draft"\s*:\s*input\.status/);

    expect(PRODUCT_WRITE).toContain("adminReviewPublish: true");

    const guards = readFileSync(join(__dirname, "clipboard-promote-guards.ts"), "utf8");

    expect(guards).toContain("clipboardUrlImportActiveStatusError");

  });



  it("admin product editor actions delegate to product-write without CatalogOS publish", () => {

    expect(EDITOR_ACTIONS).toContain("insertCatalogProduct");

    expect(EDITOR_ACTIONS).toContain("updateCatalogProduct");

    expect(EDITOR_ACTIONS).not.toMatch(/\brunPublish\b/);

  });



  it("storefront .env.example documents GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID", () => {

    const envExample = readFileSync(join(__dirname, "../../../.env.example"), "utf8");

    expect(envExample).toContain("GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID");

    expect(envExample).toMatch(/URL-import products publish through CatalogOS/i);

    expect(envExample).toMatch(/Does NOT enable card checkout/i);

    expect(envExample).toMatch(/Does NOT expose inventory/i);

  });

});


