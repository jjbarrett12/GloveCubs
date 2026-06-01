import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const URL =
  "https://www.hospecobrands.com/products/hbg-industries/retail/gloves/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-m";

async function main() {
  const { createClipboardStaging } = await import("../src/lib/admin/clipboard-url-staging");
  const res = await createClipboardStaging({
    productPageUrl: URL,
    imageUrl: null,
    createdBy: null,
  });
  console.log(JSON.stringify(res, null, 2));
  if ("extracted" in res && res.extracted) {
    const ex = res.extracted as Record<string, unknown>;
    const draft = ex.draft as Record<string, unknown> | undefined;
    console.log("\nDRAFT_SUMMARY:", JSON.stringify(draft, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
