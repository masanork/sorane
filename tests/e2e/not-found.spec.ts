import { expect, test } from "@playwright/test";

test("404.html is served with site chrome", async ({ page }) => {
  await page.goto("/404.html");
  await expect(page.locator("main#main")).toBeVisible();
  await expect(page.locator("h1")).toContainText(/404|Not Found/i);
  await expect(page.locator("header.site-header a.site-title")).toBeVisible();
});