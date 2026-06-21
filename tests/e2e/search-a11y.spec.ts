import { expect, test } from "@playwright/test";

test("header search exposes aria-live status", async ({ page }) => {
  await page.goto("/index.html");
  const status = page.locator(".search--header [data-search-status][aria-live='polite']");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-atomic", "true");
});

test("header search updates aria-live on query", async ({ page }) => {
  await page.goto("/index.html");
  const status = page.locator(".search--header [data-search-status]");
  const input = page.locator(".search--header .search-input");
  await expect(input).toBeVisible();

  await input.fill("Welcome");
  await page.locator(".search--header .search-form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });

  await expect(status).toContainText(/\d+ 件|該当するページは見つかりません/, { timeout: 15_000 });
});

test("header search shows visible empty state when no hits", async ({ page }) => {
  await page.goto("/index.html");
  const input = page.locator(".search--header .search-input");
  const empty = page.locator(".search--header .search-empty");

  await input.fill("zzzznotfoundquery12345");
  await page.locator(".search--header .search-form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });

  await expect(empty).toBeVisible({ timeout: 15_000 });
  await expect(empty).toContainText(/該当するページは見つかりません|No matching pages/);
});

test("search results list is aria-live", async ({ page }) => {
  await page.goto("/index.html");
  const results = page.locator(
    ".search--header .search-results[aria-live='polite'][aria-relevant='additions']",
  );
  await expect(results).toHaveCount(1);

  await page.locator(".search--header .search-input").fill("Mermaid");
  await page.locator(".search--header .search-form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });

  await expect(results.locator("li.search-hit")).not.toHaveCount(0, { timeout: 15_000 });
});