import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { normalizeConcept, queryOkfcFts } from "../packages/okf/src/index.ts";
import { resolveOkfcBuildConfig } from "../packages/core/src/okfc-config.ts";
import { resolveOkfcPackPlans } from "../packages/core/src/okfc-units.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

describe("resolveOkfcPackPlans", () => {
  test("site + auto_directories + explicit unit", () => {
    const eligible = [
      {
        concept: normalizeConcept(
          { type: "article", title: "A" },
          "body",
          "a",
        ),
        slug: "a",
        relPath: "datasets/a.md",
      },
      {
        concept: normalizeConcept(
          { type: "dataset", title: "B", description: "d", resource: "r", license: "MIT", publisher: { name: "O" }, distributions: [{ title: "t", format: "csv", accessURL: "/x" }], profile: "sorane-okf/0.3" },
          "body",
          "b",
        ),
        slug: "b",
        relPath: "datasets/b.md",
      },
      {
        concept: normalizeConcept({ type: "article", title: "Root" }, "body", "r"),
        slug: "root",
        relPath: "root.md",
      },
    ];
    const cfg = resolveOkfcBuildConfig(
      {
        site: true,
        auto_directories: true,
        min_entries: 2,
        units: [
          {
            id: "open-data",
            title: "Open data",
            match: { dirs: ["datasets"], types: ["dataset"] },
          },
        ],
      },
      true,
    );
    const plans = resolveOkfcPackPlans(eligible, cfg, {
      siteTitle: "Site",
      baseUrl: "https://ex.dev",
    });
    const ids = plans.map((p) => p.id).sort();
    expect(ids).toContain("site");
    expect(ids).toContain("datasets");
    expect(ids).toContain("open-data");
    const site = plans.find((p) => p.id === "site")!;
    expect(site.concepts.length).toBe(3);
    const open = plans.find((p) => p.id === "open-data")!;
    expect(open.concepts.length).toBe(1);
    expect(open.concepts[0]!.slug).toBe("b");
  });
});

describe("build OKFC units + FTS query", () => {
  test("auto unit + registry + queryOkfcFts", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-okfc-units-"));
    try {
      const content = join(root, "content");
      mkdirSync(join(content, "topics"), { recursive: true });
      writeFileSync(
        join(content, "index.md"),
        "---\ntype: index\ntitle: Home\n---\n\n# Home\n",
        "utf8",
      );
      writeFileSync(
        join(content, "topics", "alpha.md"),
        [
          "---",
          "type: article",
          "title: Alpha Topic",
          "profile: sorane-okf/0.1",
          "---",
          "",
          "## Intro",
          "",
          "Alpha unique keyword zephyr for unit FTS search path.",
          "Padding text so the chunk exceeds the minimum character threshold easily.",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(content, "topics", "beta.md"),
        [
          "---",
          "type: article",
          "title: Beta Topic",
          "profile: sorane-okf/0.1",
          "---",
          "",
          "## Intro",
          "",
          "Beta content without the special term here.",
          "Padding text so the chunk exceeds the minimum character threshold easily.",
        ].join("\n"),
        "utf8",
      );

      const config = mergeConfig({
        site: {
          title: "Units",
          description: "test",
          base_url: "https://units.example",
          lang: "ja",
        },
        build: {
          content_dir: "content",
          out_dir: "dist",
          permalink: "{{slug}}.html",
          outputs: {
            okfc: true,
            llms_txt: true,
            catalog: false,
            okf_bundle: false,
            feed: false,
            sitemap: false,
            robots: false,
            md_alternate: false,
          },
          okfc: {
            auto_directories: true,
            min_entries: 2,
          },
        },
      });

      await runBuild({ cwd: root, config, clean: true });

      expect(existsSync(join(root, "dist", "okf", "site.okfc"))).toBe(true);
      expect(existsSync(join(root, "dist", "okf", "units", "topics.okfc"))).toBe(
        true,
      );
      expect(existsSync(join(root, "dist", "okf", "registry.json"))).toBe(true);

      const registry = JSON.parse(
        readFileSync(join(root, "dist", "okf", "registry.json"), "utf8"),
      ) as { bundles: { id: string; path: string; search: string }[] };
      expect(registry.bundles.some((b) => b.id === "site")).toBe(true);
      expect(registry.bundles.some((b) => b.id === "topics")).toBe(true);
      expect(registry.bundles.every((b) => b.search === "fts")).toBe(true);

      const unitPath = join(root, "dist", "okf", "units", "topics.okfc");
      const hits = await queryOkfcFts(unitPath, "zephyr", { limit: 5 });
      expect(hits.some((h) => h.id.includes("alpha"))).toBe(true);

      const llms = readFileSync(join(root, "dist", "llms.txt"), "utf8");
      expect(llms).toContain("okf/registry.json");
      expect(llms).toContain("okf/units/topics.okfc");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
