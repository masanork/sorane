import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  runSoraneAstroTsBackend,
  soraneAstroNativeCliAvailable,
} from "../packages/astro/src/index.ts";

function validationInput(files: Record<string, string>): ReturnType<typeof buildSoraneAstroBackendInput> {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-val-parity-"));
  const contentDir = join(root, "src", "content");
  mkdirSync(contentDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(contentDir, name), body);
  }
  const paths = { root, contentDir, outDir: join(root, "dist") };
  return buildSoraneAstroBackendInput(
    {
      site: { title: "Val", description: "parity", baseUrl: "https://example.dev" },
      validate: "warn",
    },
    paths,
    collectSoraneAstroBackendFiles(contentDir),
  );
}

describe("Astro backend validation parity (Phase A)", () => {
  test("native validation counts match TypeScript for OKF type error", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "bad-type.md": `---
type: playbook
title: Bad
timestamp: 2026-07-04T00:00:00Z
---

body
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(ts.validationErrors > 0).toBe(true);
    expect(native.validationErrors > 0).toBe(true);
    expect(
      ts.validationDetails.some((d) => d.includes("未サポートの type: playbook")),
    ).toBe(true);
    expect(
      native.validationDetails.some((d) => d.includes("未サポートの type: playbook")),
    ).toBe(true);
  });

  test("native validation counts match TypeScript for image alt warning", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "img.md": `---
type: article
title: Img
timestamp: 2026-07-04T00:00:00Z
---

![](photo.png)
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for heading skip", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "head.md": `---
type: article
title: Head
timestamp: 2026-07-04T00:00:00Z
---

#### skipped
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });
});