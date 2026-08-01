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
      expect(result.vectorCount).toBe(0);
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

describe("queryOkfcHybrid (U3+)", () => {
  test("vec + FTS RRF returns chunk hits", async () => {
    const {
      buildKnowledgeIr,
      attachKnowledgeEmbeddings,
      packOkfcFromIr,
      queryOkfcHybrid,
      okfcHasVecChunks,
    } = await import("../packages/okf/src/index.ts");
    const dir = mkdtempSync(join(tmpdir(), "sorane-okfc-hybrid-"));
    const dbPath = join(dir, "site.okfc");
    try {
      const a = normalizeConcept(
        { type: "article", title: "Alpha Doc" },
        "## Sec\n\n" + "alpha hybrid unique phrase about cats. ".repeat(6),
        "alpha",
      );
      const b = normalizeConcept(
        { type: "article", title: "Beta Doc" },
        "## Sec\n\n" + "beta hybrid unique phrase about dogs. ".repeat(6),
        "beta",
      );
      let ir = buildKnowledgeIr([
        { concept: a, slug: "alpha" },
        { concept: b, slug: "beta" },
      ]);
      const dim = 8;
      // Distinct unit vectors per concept chunks
      const embeddings = ir.chunks.map((c) => {
        const v = new Float32Array(dim);
        if (c.concept_id.includes("alpha")) v[0] = 1;
        else v[1] = 1;
        return { text_hash: c.text_hash, vector: v };
      });
      const byHash = new Map(embeddings.map((e) => [e.text_hash, e]));
      ir = attachKnowledgeEmbeddings(ir, [...byHash.values()], {
        model_id: "test-model",
        dim,
      });
      await packOkfcFromIr({
        dbPath,
        ir,
        meta: { bundle_id: "h", title: "H", bundle_type: "site" },
      });
      expect(await okfcHasVecChunks(dbPath)).toBe(true);

      // Query vector near alpha
      const q = new Float32Array(dim);
      q[0] = 0.95;
      q[1] = 0.05;
      const hits = await queryOkfcHybrid(dbPath, "cats", q, { limit: 5 });
      expect(hits.length >= 1).toBe(true);
      expect(hits[0]!.concept_id).toBe("article/alpha");
      expect(hits[0]!.mode === "hybrid" || hits[0]!.mode === "vec").toBe(true);
      expect(hits[0]!.text.length > 0).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no queryVec degrades to FTS chunk expand", async () => {
    const {
      buildKnowledgeIr,
      packOkfcFromIr,
      queryOkfcHybrid,
    } = await import("../packages/okf/src/index.ts");
    const dir = mkdtempSync(join(tmpdir(), "sorane-okfc-hyb-fts-"));
    const dbPath = join(dir, "site.okfc");
    try {
      const concept = normalizeConcept(
        { type: "article", title: "Only FTS" },
        "## S\n\n" + "plain fts only body without any vectors here. ".repeat(5),
        "fts",
      );
      const ir = buildKnowledgeIr([{ concept, slug: "fts" }]);
      await packOkfcFromIr({
        dbPath,
        ir,
        meta: { bundle_id: "f", title: "F", bundle_type: "site" },
      });
      const hits = await queryOkfcHybrid(dbPath, "vectors", null, { limit: 3 });
      expect(hits.length >= 1).toBe(true);
      expect(hits[0]!.mode).toBe("fts");
      expect(hits[0]!.concept_id).toBe("article/fts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("packOkfcFromIr with vectors (U3)", () => {
  test("IR embeddings → vec_chunks + hybrid meta", async () => {
    const { buildKnowledgeIr, attachKnowledgeEmbeddings, packOkfcFromIr } =
      await import("../packages/okf/src/index.ts");
    const sqliteVec = await import("sqlite-vec");
    const dir = mkdtempSync(join(tmpdir(), "sorane-okfc-vec-"));
    const dbPath = join(dir, "site.okfc");
    try {
      const concept = normalizeConcept(
        { type: "article", title: "Vec" },
        "## Sec\n\n" + "vector body text ".repeat(8),
        "vec",
      );
      let ir = buildKnowledgeIr([{ concept, slug: "vec" }]);
      expect(ir.chunks.length >= 1).toBe(true);
      const dim = 8;
      const embeddings = ir.chunks.map((c, i) => {
        const v = new Float32Array(dim);
        v[0] = (i + 1) * 0.1;
        return { text_hash: c.text_hash, vector: v };
      });
      const byHash = new Map(embeddings.map((e) => [e.text_hash, e]));
      ir = attachKnowledgeEmbeddings(ir, [...byHash.values()], {
        model_id: "test-model",
        dim,
        quant: "f32",
      });
      const result = await packOkfcFromIr({
        dbPath,
        ir,
        meta: { bundle_id: "test", title: "T", bundle_type: "site" },
      });
      expect(result.search).toBe("hybrid");
      expect(result.vectorCount).toBe(result.chunkCount);
      expect(result.vectorCount > 0).toBe(true);

      const db = new Database(dbPath, { readonly: true });
      try {
        sqliteVec.load(db);
        const modelId = db
          .prepare("SELECT value FROM okfc_meta WHERE key = ?")
          .pluck()
          .get("model_id");
        expect(modelId).toBe("test-model");
        const dimMeta = db
          .prepare("SELECT value FROM okfc_meta WHERE key = ?")
          .pluck()
          .get("model_dim");
        expect(dimMeta).toBe(String(dim));
        const nVec = db.prepare("SELECT COUNT(*) AS c FROM vec_chunks").get() as {
          c: number;
        };
        expect(nVec.c).toBe(result.chunkCount);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
