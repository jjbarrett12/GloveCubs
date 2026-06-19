/**
 * Production smoke for /compare-wizard — no secrets logged.
 * Usage: node scripts/compare-wizard-prod-smoke.mjs [--base=https://www.glovecubs.com]
 */
import { chromium, devices } from "@playwright/test";

const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://www.glovecubs.com";
const URL = `${BASE.replace(/\/$/, "")}/compare-wizard`;

const FORBIDDEN = [
  "standard_cost",
  "supplier_private",
  "inventory_count",
  "stock on hand",
  "CatalogOS-only",
  "draft product",
  "inactive sku",
];

const report = { base: BASE, url: URL, checks: {}, consoleErrors: [], pageErrors: [] };

function setCheck(name, ok, detail) {
  report.checks[name] = { ok, detail };
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function clickSort(page, label) {
  await page.getByRole("button", { name: new RegExp(label, "i") }).click();
}

async function runDesktop(page) {
  const res = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  setCheck("http_200", res?.status() === 200, `status=${res?.status() ?? "none"}`);

  const title = page.getByRole("heading", { name: /Glove Sales Sheet/i });
  setCheck("page_title", await title.isVisible(), "Glove Sales Sheet heading visible");

  const table = page.locator("table");
  setCheck("table_present", await table.isVisible(), "compare table visible");

  const rowCount = await page.locator("tbody tr").count();
  setCheck("active_rows", rowCount > 0, `${rowCount} table rows rendered`);

  const skuLink = page.locator('tbody a[href^="/store/p/"]').first();
  const skuHref = await skuLink.getAttribute("href");
  setCheck("sku_pdp_link", Boolean(skuHref?.startsWith("/store/p/")), skuHref ?? "missing");

  const nameLink = page.locator('tbody td:nth-child(2) a[href^="/store/p/"]').first();
  const nameHref = await nameLink.getAttribute("href");
  setCheck("name_pdp_link", Boolean(nameHref?.startsWith("/store/p/")), nameHref ?? "missing");

  for (const col of ["Case Price", "Pallet Price", "Boxes/Case", "Thickness", "Product Name"]) {
    await clickSort(page, col);
    setCheck(`sort_${col.replace(/\s+/g, "_").toLowerCase()}`, true, "header click ok");
  }

  const material = page.locator('select').nth(0);
  const options = await material.locator("option").allTextContents();
  const pick = options.find((o) => o && o !== "All");
  if (pick) {
    await material.selectOption({ label: pick });
    setCheck("filter_material", true, `selected ${pick}`);
  } else {
    setCheck("filter_material", false, "no material options");
  }

  await page.getByRole("button", { name: /clear filters/i }).click();

  const sizeSelect = page.locator("select").nth(4);
  const sizeOptions = await sizeSelect.locator("option").allTextContents();
  const sizePick = sizeOptions.find((o) => o === "M" || o === "L" || o === "XL");
  if (sizePick) {
    await sizeSelect.selectOption({ label: sizePick });
    const visibleSizes = await page.locator("tbody td:nth-child(4)").allTextContents();
    const rangeMatch = visibleSizes.some((s) => /S.?XL|XS.?XL|M.?2XL|S.?XXL/.test(s) || s.includes(sizePick));
    setCheck("filter_size_range", rangeMatch || visibleSizes.length === 0, `size=${sizePick}, sample=${visibleSizes[0] ?? "none"}`);
  } else {
    setCheck("filter_size_range", false, "no M/L/XL size option");
  }

  const bodyText = await page.locator("body").innerText();
  const forbiddenHit = FORBIDDEN.find((f) => bodyText.toLowerCase().includes(f.toLowerCase()));
  setCheck("no_forbidden_fields", !forbiddenHit, forbiddenHit ?? "none found");

  const tools = page.getByRole("link", { name: /Compare Wizard/i });
  setCheck("desktop_tools_nav", await tools.count() > 0, `${await tools.count()} nav links`);
}

async function runMobile(browser) {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => report.pageErrors.push(String(err)));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: /menu/i }).click().catch(() => {});
  const mobileLink = page.getByRole("link", { name: /Compare Wizard/i }).last();
  setCheck("mobile_tools_nav", await mobileLink.isVisible().catch(() => false), "Compare Wizard in mobile nav");

  const scrollWidth = await page.evaluate(() => {
    const el = document.querySelector(".overflow-x-auto");
    return el ? { client: el.clientWidth, scroll: el.scrollWidth } : null;
  });
  setCheck(
    "mobile_horizontal_scroll",
    Boolean(scrollWidth && scrollWidth.scroll > scrollWidth.client),
    scrollWidth ? `scroll=${scrollWidth.scroll} client=${scrollWidth.client}` : "no scroll container"
  );

  await context.close();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => report.pageErrors.push(String(err));

try {
  await runDesktop(page);
  await runMobile(browser);
} finally {
  await browser.close();
}

setCheck("no_console_errors", report.consoleErrors.length === 0, report.consoleErrors.join(" | ") || "clean");
setCheck("no_runtime_errors", report.pageErrors.length === 0, report.pageErrors.join(" | ") || "clean");

const failed = Object.values(report.checks).filter((c) => !c.ok).length;
console.log(JSON.stringify(report, null, 2));
process.exit(failed > 0 ? 1 : 0);
