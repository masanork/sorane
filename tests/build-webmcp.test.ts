import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfig } from "../packages/core/src/config.ts";
import { runBuild } from "../packages/core/src/build.ts";

test("built WebMCP export shares publication gates, supports duplicate locale slugs and revokes bodies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sorane-webmcp-build-"));
  try {
    const content = join(dir, "content");
    mkdirSync(join(content, "en"), { recursive: true });
    const write = (path: string, fm: string, body: string) => writeFileSync(join(content, path), `---\n${fm}\n---\n\n${body}`);
    write("index.md", "type: index\ntitle: Home", "Home");
    write("search.md", "type: article\ntitle: Search\nview: search", "Search");
    write("guide.md", 'type: article\ntitle: Japanese guide\nupdated: "2026-10-01"', "## Brief\n\n短い本文でも公開対象。");
    write("en/guide.md", 'type: article\ntitle: English guide\nupdated: "2026-10-02"', "## Brief\n\nComplete English guide body.");
    write("draft.md", "type: article\ntitle: Draft\ndraft: true", "secret-draft-body");
    write("system.md", "type: article\ntitle: System\nisSystem: true", "system-page-body");
    write("404.md", "type: article\ntitle: Not Found", "not-found-body");
    const config = mergeConfig({
      site: { title: "T", description: "D", base_url: "https://example.test", lang: "ja",
        i18n: { locales: { en: { lang: "en", path_prefix: "en" } } } },
      build: { content_dir: "content", out_dir: "dist", permalink: "{{slug}}.html", outputs: { okfc: true },
        security: { search_snippet_only: true },
        okfc: { units: [{ id: "guides", match: { dirs: ["en"] } }] } },
      search: { webmcp: { read_page: true, datasets: true, knowledge_packs: true } },
    });
    await runBuild({ cwd: dir, config });
    const dist = join(dir, "dist");
    const manifestPath = join(dist, "assets/webmcp-content.json");
    const json = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(json);
    assert.doesNotMatch(json, /secret-draft-body|system-page-body|not-found-body/);
    assert.equal(manifest.pages.find((page: any) => page.url === "guide.html").lang, "ja");
    assert.equal(manifest.pages.find((page: any) => page.url === "en/guide.html").lang, "en");
    assert.ok(manifest.packs.some((pack: any) => pack.id === "guides" && pack.pages.includes("en/guide.html")));
    const index = JSON.parse(readFileSync(join(dist, "assets/search-index.json"), "utf8"));
    assert.ok(index.chunks.every((chunk: any) => !("text" in chunk)));
    assert.ok(index.chunks.some((chunk: any) => chunk.source === "guide.md" && chunk.lang === "ja"));
    assert.ok(index.chunks.some((chunk: any) => chunk.source === "en/guide.md" && chunk.lang === "en"));
    const initialWorker = readFileSync(join(dist, "sw.js"), "utf8");
    assert.match(initialWorker, /webmcp-content\.json/);
    await runBuild({ cwd: dir, config: { ...config, search: { ...config.search, webmcp: true } } });
    assert.equal(existsSync(manifestPath), false);
    const worker = readFileSync(join(dist, "sw.js"), "utf8");
    assert.doesNotMatch(worker, /webmcp-content\.json/);
    assert.notEqual(worker, initialWorker);
    // Disabling body access while retaining metadata must replace the export too.
    await runBuild({ cwd: dir, config: { ...config, search: { ...config.search, webmcp: { datasets: true } } } });
    const metadataOnly = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.ok(metadataOnly.pages.every((page: any) => !("body" in page)));
    assert.deepEqual(metadataOnly.packs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
