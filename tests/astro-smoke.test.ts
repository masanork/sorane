import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "./_expect.ts";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const exampleDir = join(repoRoot, "examples/astro-minimal");

function astroAvailable(): boolean {
  try {
    execSync("npx astro --version", { cwd: exampleDir, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("examples/astro-minimal", () => {
  test("astro build emits sorane artifacts", async (t) => {
    if (!astroAvailable()) return t.skip("astro not installed");

    execSync("npm install --no-audit --no-fund", {
      cwd: exampleDir,
      stdio: "pipe",
      env: { ...process.env, npm_config_loglevel: "error" },
    });
    execSync("npm run build", { cwd: exampleDir, stdio: "pipe" });

    expect(existsSync(join(exampleDir, "dist", "catalog.jsonld"))).toBe(true);
    expect(existsSync(join(exampleDir, "dist", "llms.txt"))).toBe(true);
    expect(existsSync(join(exampleDir, "dist", "okf", "bundle.tar.gz"))).toBe(true);

    const catalog = readFileSync(join(exampleDir, "dist", "catalog.jsonld"), "utf8");
    expect(catalog).toContain("Hello Astro");
    expect(catalog).toContain("https://example.dev/blog/hello.html");

    expect(existsSync(join(exampleDir, "dist", "assets", "search-index.json"))).toBe(
      true,
    );
    expect(existsSync(join(exampleDir, "dist", "assets", "search.mjs"))).toBe(true);
    const searchIndex = readFileSync(
      join(exampleDir, "dist", "assets", "search-index.json"),
      "utf8",
    );
    expect(searchIndex).toContain("blog/hello.html");
  });
});