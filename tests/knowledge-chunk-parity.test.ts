import { describe, expect, test } from "./_expect.ts";
import {
  chunkProseMarkdown,
  chunkMarkdownBody,
  buildKnowledgeIr,
  sliceKnowledgeIr,
  packOkfcFromIr,
  normalizeConcept,
  conceptIdFor,
} from "../packages/okf/src/index.ts";
import { chunkDocument as searchChunkDocument } from "../packages/search/src/chunker.ts";
import { searchChunksFromKnowledgeIr } from "../packages/search/src/from-ir.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

describe("knowledge chunk parity (U0)", () => {
  const body = [
    "Lead paragraph with enough characters to become its own section chunk for indexing.",
    "",
    "## First",
    "",
    "Alpha body text with sufficient length so the prose chunker keeps this section.",
    "",
    "### Nested",
    "",
    "Nested body also long enough for a dedicated prose chunk under First.",
    "",
    "## Second",
    "",
    "Beta body text with sufficient length so the prose chunker keeps this section too.",
  ].join("\n");

  test("chunkProseMarkdown ≡ chunkMarkdownBody", () => {
    const a = chunkProseMarkdown(body, "Title");
    const b = chunkMarkdownBody(body, "Title");
    expect(a.map((c) => c.text)).toEqual(b.map((c) => c.text));
    expect(a.map((c) => c.heading_path)).toEqual(b.map((c) => c.heading_path));
  });

  test("search chunkDocument prose texts ⊆ / match shared chunker", () => {
    const source = `---\ntype: article\ntitle: Title\n---\n\n${body}\n`;
    const search = searchChunkDocument(source, "article/title.md");
    const prose = chunkProseMarkdown(body, "Title");
    expect(search.map((c) => c.text)).toEqual(prose.map((c) => c.text));
    expect(search.map((c) => c.headingPath)).toEqual(prose.map((c) => c.heading_path));
  });

  test("buildKnowledgeIr chunks match pack prose", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Title", profile: "sorane-okf/0.1" },
      body,
      "title",
    );
    const ir = buildKnowledgeIr([{ concept, slug: "title" }]);
    const prose = chunkProseMarkdown(body, "Title");
    expect(ir.chunks.map((c) => c.text)).toEqual(prose.map((c) => c.text));
    expect(ir.concepts[0]!.id).toBe("article/title");
  });

  test("U1 packOkfcFromIr writes IR chunks; U2 search projection matches", async () => {
    const concept = normalizeConcept(
      { type: "article", title: "Title", profile: "sorane-okf/0.1" },
      body,
      "title",
    );
    const id = conceptIdFor("article", "title");
    const ir = buildKnowledgeIr(
      [{ concept, slug: "title" }],
      { sourcePathByConceptId: new Map([[id, "article/title.md"]]) },
    );
    const dir = mkdtempSync(join(tmpdir(), "sorane-ir-pack-"));
    try {
      const dbPath = join(dir, "site.okfc");
      const result = await packOkfcFromIr({
        dbPath,
        ir,
        meta: { bundle_id: "test", title: "T", bundle_type: "site" },
      });
      expect(result.conceptCount).toBe(1);
      expect(result.chunkCount).toBe(ir.chunks.length);

      const db = new Database(dbPath, { readonly: true });
      try {
        const rows = db
          .prepare(
            "SELECT text FROM chunks WHERE concept_id = ? ORDER BY chunk_index",
          )
          .all(id) as { text: string }[];
        expect(rows.map((r) => r.text)).toEqual(ir.chunks.map((c) => c.text));
      } finally {
        db.close();
      }

      const searchChunks = searchChunksFromKnowledgeIr(ir);
      expect(searchChunks.map((c) => c.text)).toEqual(ir.chunks.map((c) => c.text));
      expect(searchChunks[0]!.source).toBe("article/title.md");
      expect(searchChunks[0]!.docType).toBe("article");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sliceKnowledgeIr keeps subset", () => {
    const a = normalizeConcept({ type: "article", title: "A" }, body, "a");
    const b = normalizeConcept({ type: "article", title: "B" }, body, "b");
    const ir = buildKnowledgeIr([
      { concept: a, slug: "a" },
      { concept: b, slug: "b" },
    ]);
    const sliced = sliceKnowledgeIr(ir, new Set(["article/a"]));
    expect(sliced.concepts.length).toBe(1);
    expect(sliced.concepts[0]!.id).toBe("article/a");
    expect(sliced.chunks.every((c) => c.concept_id === "article/a")).toBe(true);
  });
});

describe("knowledge U3 embeddings on IR", () => {
  const embBody = [
    "Lead paragraph with enough characters to become its own section chunk for indexing.",
    "",
    "## First",
    "",
    "Alpha body text with sufficient length so the prose chunker keeps this section.",
  ].join("\n");

  test("attachKnowledgeEmbeddings + unique texts", async () => {
    const {
      attachKnowledgeEmbeddings,
      uniqueChunkTextsForEmbed,
      hashProseChunkText,
    } = await import("../packages/okf/src/index.ts");
    const concept = normalizeConcept(
      { type: "article", title: "E" },
      embBody,
      "e",
    );
    const ir = buildKnowledgeIr([{ concept, slug: "e" }]);
    const unique = uniqueChunkTextsForEmbed(ir);
    expect(unique.length).toBe(ir.chunks.length);
    const dim = 4;
    const embeddings = unique.map((u, i) => ({
      text_hash: u.text_hash,
      vector: Array.from({ length: dim }, (_, j) => i + j * 0.01),
    }));
    const withEmb = attachKnowledgeEmbeddings(ir, embeddings, {
      model_id: "mock",
      dim,
    });
    expect(withEmb.embeddings?.length).toBe(unique.length);
    expect(withEmb.model?.model_id).toBe("mock");
    expect(hashProseChunkText(unique[0]!.text)).toBe(unique[0]!.text_hash);
  });

  test("embedKnowledgeIr mock provider dedupes by hash", async () => {
    const { embedKnowledgeIr } = await import("../packages/search/src/embed-ir.ts");
    const concept = normalizeConcept(
      { type: "article", title: "E2" },
      embBody,
      "e2",
    );
    const ir = buildKnowledgeIr([{ concept, slug: "e2" }]);
    let calls = 0;
    const provider = {
      dimensions: 4,
      modelId: "mock-ruri",
      quant: "q8",
      modelSha256: "abc",
      async embed(text: string) {
        calls += 1;
        return [text.length, 0, 0, 1];
      },
      async embedBatch(texts: string[]) {
        const out: number[][] = [];
        for (const t of texts) out.push(await this.embed(t));
        return out;
      },
    };
    const embedded = await embedKnowledgeIr(ir, provider);
    expect(embedded.embeddings?.length).toBe(ir.chunks.length);
    expect(calls).toBe(ir.chunks.length);
    // second pass should reuse
    const again = await embedKnowledgeIr(embedded, provider);
    expect(again.embeddings?.length).toBe(ir.chunks.length);
    expect(calls).toBe(ir.chunks.length);
  });
});

describe("knowledge U2.1 type-aware IR", () => {
  test("faq IR chunks match search chunkDocument", () => {
    const source = `---
type: faq
title: FAQ
---

## License?
CC-BY-4.0 applies.

## Download?
See the dataset page.
`;
    const search = searchChunkDocument(source, "faq.md");
    expect(search.length).toBe(2);

    const bodyOnly = [
      "## License?",
      "CC-BY-4.0 applies.",
      "",
      "## Download?",
      "See the dataset page.",
    ].join("\n");
    const concept = normalizeConcept({ type: "faq", title: "FAQ" }, bodyOnly, "faq");
    const ir = buildKnowledgeIr(
      [{ concept, slug: "faq" }],
      { sourcePathByConceptId: new Map([["faq/faq", "faq.md"]]) },
    );
    const projected = searchChunksFromKnowledgeIr(ir);
    expect(projected.map((x) => x.text)).toEqual(search.map((x) => x.text));
  });
});

