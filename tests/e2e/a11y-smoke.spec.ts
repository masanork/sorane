import { expect, test } from "@playwright/test";

test("skip link and main landmark on index", async ({ page }) => {
  await page.goto("/index.html");
  const skip = page.locator('a.skip-link[href="#main"]');
  await expect(skip).toHaveCount(1);
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(page.locator("main#main")).toHaveCount(1);
});

test("focus-visible ring on skip link", async ({ page }) => {
  await page.goto("/index.html");
  const outline = await page.locator('a.skip-link').evaluate((el) => {
    el.focus();
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline === "solid" || outline === "auto").toBe(true);
});