/**
 * Live parse review for Hospeco/Safety Zone glove PDP (no DB writes).
 */
import { fetchHtmlForImport } from "../src/lib/admin/import-draft-fetch";
import { toImportDraftProductV1 } from "../src/lib/admin/import-draft-mapper";
import { extractProductFromHtml } from "../src/lib/admin/productExtraction";
import { importDraftToProductWriteInput } from "../src/lib/admin/import-draft-promote";

const URL =
  "https://www.hospecobrands.com/products/hbg-industries/retail/gloves/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-m";

async function main() {
  const { html, truncated } = await fetchHtmlForImport(URL);
  const result = extractProductFromHtml(html, URL);
  const draft = toImportDraftProductV1(result, URL);
  const write = importDraftToProductWriteInput(
    draft,
    { category_id: "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5" },
    {}
  );

  console.log(
    JSON.stringify(
      {
        truncated,
        draft: {
          product_name: draft.product_name,
          brand: draft.brand,
          material: draft.material,
          color: draft.color,
          thickness_mil: draft.thickness_mil,
          case_pack: draft.case_pack,
          units_per_case: draft.units_per_case,
          powder_free: draft.powder_free,
          exam_grade: draft.exam_grade,
          glove_grade: draft.glove_grade,
          size: draft.size,
          variants: draft.variants,
          parse_warnings: draft.parse_warnings,
        },
        promote: {
          attributes: write.attributes,
          variants: write.variants,
        },
        extraction_sources: result.reasoning.sources,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
