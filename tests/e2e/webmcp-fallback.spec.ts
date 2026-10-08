import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--disable-features=WebMCP"] }, serviceWorkers: "block" });

test("unsupported browsers keep ordinary search without installing a polyfill", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/search.html");
  expect(await page.evaluate(() => typeof (document as Document & { modelContext?: unknown }).modelContext)).toBe("undefined");
  await page.locator(".search-input").fill("contractneedle");
  await page.locator(".search-submit").click();
  await expect(page.locator(".search-hit")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rejected registration leaves search usable and has no unhandled error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      value: { registerTool: async () => { throw new Error("tools permission denied"); } },
    });
  });
  const warning = page.waitForEvent("console", (message) => message.text().includes("registration failed"));
  await page.goto("/search.html");
  expect((await warning).type()).toBe("warning");
  await page.locator(".search-input").fill("contractneedle");
  await page.locator(".search-submit").click();
  await expect(page.locator(".search-hit")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
