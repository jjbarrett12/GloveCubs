import { test, expect } from "@playwright/test";

const ALLOWED_CONSOLE_PATTERNS = [
  /favicon/i,
  /Failed to load resource.*favicon/i,
  /Download the React DevTools/i,
];

function isAllowedConsoleMessage(text: string): boolean {
  return ALLOWED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

test.describe("Homepage UI smoke", () => {
  test("loads styled homepage without static asset or console failures", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedStaticRequests: { url: string; status: number }[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (isAllowedConsoleMessage(text)) return;
      consoleErrors.push(text);
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    page.on("response", (response) => {
      const url = response.url();
      if (!url.includes("/_next/static/")) return;
      const status = response.status();
      if (status >= 400) {
        failedStaticRequests.push({ url, status });
      }
    });

    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response?.ok(), "homepage HTTP response should be OK").toBeTruthy();

    expect(
      failedStaticRequests,
      `Failed /_next/static requests: ${JSON.stringify(failedStaticRequests, null, 2)}`,
    ).toEqual([]);

    expect(
      consoleErrors,
      `Console errors on homepage:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);

    const hero = page.locator('[data-ui-section="hero"]');
    await expect(hero).toBeVisible();

    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    const appRoot = page.locator('[data-ui-root="homepage"]');
    await expect(appRoot).toBeVisible();

    const bodyStyles = await page.evaluate(() => {
      const body = document.body;
      const cs = getComputedStyle(body);
      return {
        backgroundColor: cs.backgroundColor,
        minHeight: cs.minHeight,
        fontFamily: cs.fontFamily,
      };
    });

    expect(bodyStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bodyStyles.backgroundColor).not.toBe("transparent");
    expect(parseFloat(bodyStyles.minHeight)).toBeGreaterThan(100);

    const headerStyles = await header.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderBottomWidth: cs.borderBottomWidth,
      };
    });

    expect(headerStyles.backgroundColor).toMatch(/rgb\(255,\s*255,\s*255\)/);
    expect(parseFloat(headerStyles.borderBottomWidth)).toBeGreaterThan(0);

    const heroStyles = await hero.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
      };
    });

    expect(heroStyles.backgroundColor).toMatch(/rgb\(10,\s*10,\s*10\)/);

    const tailwindProbe = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "hidden";
      document.body.appendChild(el);
      const display = getComputedStyle(el).display;
      el.remove();
      return display === "none";
    });
    expect(tailwindProbe, "Tailwind utility classes should be active").toBe(true);

    const stylesheetCount = await page.evaluate(() => {
      return document.querySelectorAll('link[rel="stylesheet"]').length;
    });
    expect(stylesheetCount).toBeGreaterThan(0);
  });
});
