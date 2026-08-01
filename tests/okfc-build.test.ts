import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

describe("build outputs.okfc", () => {
  test("okf/site.okfc を出力し FTS 検索できる", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-okfc-build-"));
    try {
      const content = join(root, "content");
      mkdirSync(content, { recursive: true });
      writeFileSync(
        join(content, "index.md"),
        `---\ntype: index\ntitle: Home\n---\n\n# Home\n`,
        "utf8",
      );
      writeFileSync(
        join(content, "2025-01-01-hello.md"),
        [
          "---",
          "type: article",
          "title: Hello OKFC",
          "tags: [okfc]",
          "profile: sorane-okf/0.1",
          "---",
          "",
          "## Section",
          "",
          "Queryable knowledge for agents and bunko.",
          "More prose to pass the minimum chunk length threshold easily.",
        ].join("\n"),
        "utf8",
      );

      const config = mergeConfig({
        site: {
          title: "OKFC Site",
          description: "test",
          base_url: "https://okfc.example",
          lang: "ja",
        },
        build: {
          content_dir: "content",
          out_dir: "dist",
          permalink: "{{slug}}.html",
          outputs: {
            okfc: true,
            okf_bundle: false,
            catalog: false,
            llms_txt: true,
            feed: false,
            sitemap: false,
            robots: false,
            md_alternate: false,
          },
        },
      });

      await runBuild({ cwd: root, config, clean: true });

      const okfcPath = join(root, "dist", "okf", "site.okfc");
      expect(existsSync(okfcPath)).toBe(true);

      const db = new Database(okfcPath, { readonly: true });
      try {
        const ids = db.prepare("SELECT id FROM concepts ORDER BY id").all() as {
          id: string;
        }[];
        expect(ids.map((r) => r.id)).toEqual(["article/2025-01-01-hello"]);

        const hits = db
          .prepare(
            `SELECT c.id FROM concepts_fts
             JOIN concepts c ON concepts_fts.rowid = c.rowid
             WHERE concepts_fts MATCH 'Queryable'`,
          )
          .all() as { id: string }[];
        expect(hits.some((h) => h.id === "article/2025-01-01-hello")).toBe(true);
      } finally {
        db.close();
      }

      const llms = (
        await import("node:fs")
      ).readFileSync(join(root, "dist", "llms.txt"), "utf8");
      expect(llms).toContain("okf/site.okfc");
      expect(llms).toContain("okf/registry.json");
      expect(existsSync(join(root, "dist", "okf", "registry.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
