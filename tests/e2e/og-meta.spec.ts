import { expect, test } from "@playwright/test";

test("og and twitter meta tags in head", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "E2E Site");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "E2E");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://e2e.example.test/index.html",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://e2e.example.test/static/pixel.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    "https://e2e.example.test/static/pixel.png",
  );
});