import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, test } from "./_expect.ts";
import { emitSoraneAstroArtifacts } from "../packages/astro/src/index.ts";
import { runSoraneAstroTsBackend } from "../packages/astro/src/backend-ts.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
} from "../packages/astro/src/collect-input.ts";
import { mdRelForHtml } from "../packages/astro/src/routes.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-full-"));
  const contentDir = join(root, "src", "content", "posts");
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(
    join(contentDir, "hello.md"),
    [
      "---",
      "type: article",
      "title: Hello Full",
      "timestamp: 2026-06-01T00:00:00Z",
      "description: A post",
      "profile: sorane-okf/0.1",
      "---",
      "",
      "## Body",
      "",
      "Full publishing outputs for agents and readers.",
      "Enough prose for OKFC section chunks to register.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "content", "index.md"),
    `---\ntype: index\ntitle: Home\n---\n\nWelcome\n`,
    "utf8",
  );
  return { root, contentDir: join(root, "src", "content") };
}

describe("Astro full publishing outputs", () => {
  test("mdRelForHtml maps html and directory permalinks", () => {
    expect(mdRelForHtml("blog/hello.html")).toBe("blog/hello.md");
    expect(mdRelForHtml("blog/hello/index.html")).toBe("blog/hello/index.md");
    expect(mdRelForHtml("index.html")).toBe("index.md");
  });

  test("TS backend emits feed, robots, okfc, md alternate by default", async () => {
    const { root, contentDir } = fixture();
    try {
      const outDir = join(root, "dist");
      const input = buildSoraneAstroBackendInput(
        {
          site: {
            title: "Full",
            description: "D",
            baseUrl: "https://full.example",
          },
          collections: { posts: "blog" },
          backend: "ts",
          validate: false,
        },
        { root, contentDir, outDir },
        collectSoraneAstroBackendFiles(contentDir),
      );
      const output = await runSoraneAstroTsBackend(input);
      const paths = output.artifacts.map((a) => a.path);
      expect(paths).toContain("catalog.jsonld");
      expect(paths).toContain("llms.txt");
      expect(paths).toContain("okf/bundle.tar.gz");
      expect(paths).toContain("okf/site.okfc");
      expect(paths).toContain("feed.xml");
      expect(paths).toContain("robots.txt");
      expect(paths).toContain("okf/md/blog/hello.md");
      expect(paths).toContain("okf/md/index.md");

      const llms = String(output.artifacts.find((a) => a.path === "llms.txt")?.content);
      expect(llms).toContain("okf/site.okfc");

      const feed = String(output.artifacts.find((a) => a.path === "feed.xml")?.content);
      expect(feed).toContain("Hello Full");
      expect(feed).toContain("https://full.example/blog/hello.html");

      const robots = String(output.artifacts.find((a) => a.path === "robots.txt")?.content);
      expect(robots).toContain("Sitemap: https://full.example/sitemap.xml");

      const okfcB64 = output.artifacts.find((a) => a.path === "okf/site.okfc")?.content;
      expect(typeof okfcB64).toBe("string");
      const okfcPath = join(outDir, "okf", "site.okfc");
      mkdirSync(join(outDir, "okf"), { recursive: true });
      writeFileSync(okfcPath, Buffer.from(String(okfcB64), "base64"));
      const db = new Database(okfcPath, { readonly: true });
      try {
        const row = db
          .prepare("SELECT id, title FROM concepts WHERE id LIKE 'article/%'")
          .get() as { id: string; title: string };
        expect(row.title).toBe("Hello Full");
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("emit writes full set to dist", async () => {
    const { root, contentDir } = fixture();
    try {
      const outDir = join(root, "dist");
      const result = await emitSoraneAstroArtifacts({
        root,
        contentDir: "src/content",
        outDir: "dist",
        site: {
          title: "Full",
          description: "D",
          baseUrl: "https://full.example",
        },
        collections: { posts: "blog" },
        backend: "ts",
        validate: false,
        outputs: { search: false },
      });
      expect(result.files).toContain("okf/site.okfc");
      expect(result.files).toContain("feed.xml");
      expect(result.files).toContain("robots.txt");
      expect(result.files).toContain("okf/md/blog/hello.md");
      expect(existsSync(join(outDir, "okf", "site.okfc"))).toBe(true);
      expect(readFileSync(join(outDir, "okf", "md", "blog", "hello.md"), "utf8")).toContain(
        "type: article",
      );
      expect(readFileSync(join(outDir, "llms.txt"), "utf8")).toContain("okf/site.okfc");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("outputs can disable new features", async () => {
    const { root, contentDir } = fixture();
    try {
      const input = buildSoraneAstroBackendInput(
        {
          site: { title: "S", description: "D", baseUrl: "https://ex.dev" },
          collections: { posts: "blog" },
          backend: "ts",
          validate: false,
          outputs: {
            catalog: true,
            llmsTxt: false,
            okfBundle: false,
            okfc: false,
            feed: false,
            robots: false,
            mdAlternate: false,
            sitemap: false,
            search: false,
          },
        },
        { root, contentDir, outDir: join(root, "dist") },
        collectSoraneAstroBackendFiles(contentDir),
      );
      const output = await runSoraneAstroTsBackend(input);
      const paths = output.artifacts.map((a) => a.path);
      expect(paths).toContain("catalog.jsonld");
      expect(paths).not.toContain("feed.xml");
      expect(paths).not.toContain("okf/site.okfc");
      expect(paths).not.toContain("robots.txt");
      expect(paths.every((p) => !p.endsWith(".md") || p.includes("bundle"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
