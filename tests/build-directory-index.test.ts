import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";

const DATASET_FM = `---
type: dataset
title: Dataset A
description: First dataset.
profile: sorane-okf/0.3
resource: https://ex.dev/a
license: CC-BY-4.0
publisher:
  name: Org
distributions:
  - title: CSV
    format: csv
    accessURL: data.csv
---

Body.
`;

const REF_FM = `---
type: reference
title: Field list
description: API fields.
profile: sorane-okf/0.3
resource: https://ex.dev/spec
---

| Field | Type |
|-------|------|
| id | string |
`;

describe("runBuild directory index", () => {
  test("サブディレクトリに自動 index.html と bundle index.md", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-dir-index-"));
    const outDir = join(root, "dist");
    try {
      mkdirSync(join(root, "content", "datasets"), { recursive: true });
      writeFileSync(join(root, "content", "datasets", "a.md"), DATASET_FM);
      writeFileSync(join(root, "content", "datasets", "b.md"), REF_FM);
      await runBuild({
        cwd: root,
        config: mergeConfig({
          build: {
            out_dir: outDir,
            permalink: "{{slug}}.html",
            outputs: { okf_bundle: true },
          },
          site: { title: "Test", lang: "en", base_url: "https://ex.dev" },
        } as Partial<SoraneConfig>),
        clean: true,
      });
      const indexHtml = join(outDir, "datasets", "index.html");
      expect(existsSync(indexHtml)).toBe(true);
      const html = readFileSync(indexHtml, "utf8");
      expect(html).toContain("Dataset A");
      expect(html).toContain("Field list");
      expect(html.includes("directory-index")).toBe(true);

      const bundlePath = join(outDir, "okf", "bundle.tar.gz");
      expect(existsSync(bundlePath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});