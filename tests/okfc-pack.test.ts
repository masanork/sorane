import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, test } from "./_expect.ts";
import {
  buildOkfcConceptRow,
  chunkMarkdownBody,
  conceptFrontmatterJson,
  hashOkfcSource,
  normalizeConcept,
  packOkfc,
  prepareOkfcFtsQuery,
  queryOkfcFts,
  OKFC_SCHEMA_VERSION,
  OKFC_PACK_TOOL,
} from "../packages/okf/src/index.ts";
import { conceptToOkfMarkdown } from "../packages/okf/src/serialize.ts";

describe("chunkMarkdownBody", () => {
  test("## 見出し単位でチャンクする", () => {
    const body = [
      "## 第一",
      "",
      "あ".repeat(60),
      "",
      "## 第二",
      "",
      "い".repeat(60),
    ].join("\n");
    const chunks = chunkMarkdownBody(body, "記事");
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.heading_path).toBe("記事 / 第一");
    expect(chunks[0]!.text).toContain("あ");
    expect(chunks[1]!.heading_path).toBe("記事 / 第二");
  });

  test("見出しが無い本文は 1 チャンク", () => {
    const chunks = chunkMarkdownBody("plain body without headings here", "T");
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.heading_path).toBe("T");
  });
});

describe("buildOkfcConceptRow", () => {
  test("id は type/slug、trust と sources を載せる", () => {
    const concept = normalizeConcept(
      {
        type: "article",
        title: "Hello",
        tags: ["okf", "test"],
        status: "draft",
        generated: { by: "human:author", at: "2025-01-01T00:00:00Z" },
        verified: { by: "human:reviewer", at: "2025-01-02T00:00:00Z" },
        sources: [{ resource: "https://example.com/src", title: "Src" }],
        profile: "sorane-okf/0.2",
      },
      "## Intro\n\n" + "body ".repeat(20),
      "hello",
    );
    const row = buildOkfcConceptRow({ concept, slug: "hello" });
    expect(row.id).toBe("article/hello");
    expect(row.type).toBe("article");
    expect(row.tags).toBe("okf,test");
    expect(row.status).toBe("draft");
    expect(row.generated_by).toBe("human:author");
    expect(row.verified.length).toBe(1);
    expect(row.verified[0]!.verified_by).toBe("human:reviewer");
    expect(row.sources.length).toBe(1);
    expect(row.sources[0]!.resource).toBe("https://example.com/src");
    expect(row.body_format).toBe("markdown");
    expect(row.source_hash).toBe(hashOkfcSource(conceptToOkfMarkdown(concept)));
    const fm = JSON.parse(row.frontmatter) as Record<string, unknown>;
    expect(fm.title).toBe("Hello");
    expect(fm.profile).toBe("sorane-okf/0.2");
    expect(conceptFrontmatterJson(concept).type).toBe("article");
    expect(row.chunks.length >= 1).toBe(true);
  });
});

describe("packOkfc", () => {
  test("SQLite に meta / concepts / fts / chunks を書く", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sorane-okfc-"));
    const dbPath = join(dir, "site.okfc");
    try {
      const a = normalizeConcept(
        { type: "article", title: "A", tags: ["x"] },
        "## Sec\n\n" + "content ".repeat(15),
        "a",
      );
      const b = normalizeConcept(
        { type: "faq", title: "F" },
        "## Q\n\n" + "answer ".repeat(15),
        "f",
      );
      const result = await packOkfc({
        dbPath,
        concepts: [
          { concept: a, slug: "a" },
          { concept: b, slug: "f" },
        ],
        meta: {
          bundle_id: "https://example.dev",
          title: "Example",
          description: "desc",
          bundle_type: "site",
        },
      });
      expect(result.conceptCount).toBe(2);
      expect(result.chunkCount >= 2).toBe(true);
      expect(result.search).toBe("fts");
      expect(existsSync(dbPath)).toBe(true);

      const db = new Database(dbPath, { readonly: true });
      try {
        const schema = db
          .prepare("SELECT value FROM okfc_meta WHERE key = ?")
          .pluck()
          .get("schema_version");
        expect(schema).toBe(String(OKFC_SCHEMA_VERSION));
        expect(
          db.prepare("SELECT value FROM okfc_meta WHERE key = ?").pluck().get("pack_tool"),
        ).toBe(OKFC_PACK_TOOL);
        expect(
          db.prepare("SELECT value FROM okfc_meta WHERE key = ?").pluck().get("title"),
        ).toBe("Example");
        expect(
          db.prepare("SELECT value FROM okfc_meta WHERE key = ?").pluck().get("bundle_type"),
        ).toBe("site");

        const n = db.prepare("SELECT COUNT(*) AS c FROM concepts").get() as { c: number };
        expect(n.c).toBe(2);

        const article = db
          .prepare("SELECT id, type, title, tags FROM concepts WHERE id = ?")
          .get("article/a") as { id: string; type: string; title: string; tags: string };
        expect(article.type).toBe("article");
        expect(article.tags).toBe("x");

        const fts = db
          .prepare(
            `SELECT c.id FROM concepts_fts
             JOIN concepts c ON concepts_fts.rowid = c.rowid
             WHERE concepts_fts MATCH ?
             LIMIT 5`,
          )
          .all("content");
        expect(fts.length >= 1).toBe(true);

        const chunks = db
          .prepare("SELECT COUNT(*) AS c FROM chunks")
          .get() as { c: number };
        expect(chunks.c).toBe(result.chunkCount);

        // no vec table in FTS-only pack
        const vec = db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='vec_chunks'",
          )
          .get();
        expect(vec).toBe(undefined);
      } finally {
        db.close();
      }

      const hits = await queryOkfcFts(dbPath, "content", { limit: 5 });
      expect(hits.some((h) => h.id === "article/a")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("prepareOkfcFtsQuery", () => {
  test("トークンをクォートする", () => {
    expect(prepareOkfcFtsQuery("hello world")).toBe('"hello" "world"');
    expect(prepareOkfcFtsQuery('  a "b"  ')).toBe('"a" "b"');
  });
});
