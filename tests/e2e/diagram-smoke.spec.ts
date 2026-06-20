import { expect, test } from "@playwright/test";

test("mermaid client loader renders accessible SVG figure", async ({ page }) => {
  await page.goto("/diagram.html");
  const figure = page.locator('figure[role="img"]').first();
  await expect(figure).toBeVisible({ timeout: 20_000 });
  await expect(figure.locator("svg")).toBeVisible();
  await expect(figure).toHaveAttribute("aria-label", /E2E flow|Diagram/);
});