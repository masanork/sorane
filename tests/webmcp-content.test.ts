import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKnowledgeIr, normalizeConcept } from "@sorane/okf";
import { resolveWebMcpConfig } from "../packages/core/src/config.ts";
import { buildWebMcpContent, webMcpSections, webMcpUpdated } from "../packages/core/src/webmcp-content.ts";
import { buildSearchMount } from "../packages/core/src/ssg.ts";

test("WebMCP feature opt-ins preserve boolean search-only configuration", () => {
  assert.deepEqual(resolveWebMcpConfig(true), { enabled: true, read_page: false, datasets: false, knowledge_packs: false, contact: false });
  for (const raw of [false, undefined, null]) assert.equal(resolveWebMcpConfig(raw as any).enabled, false);
  const mount = buildSearchMount("../", { webmcp: { read_page: true, contact: true } });
  assert.match(mount, /data-webmcp-content="\.\.\/assets\/webmcp-content.json"/);
  assert.match(mount, /data-webmcp-tools="read_page"/);
  assert.match(mount, /data-webmcp-contact-enabled="true"/);
  assert.doesNotMatch(buildSearchMount("./", { webmcp: true }), /data-webmcp-content|data-webmcp-tools/);
});

test("complete nested sections include short bodies, empty headings and fence-safe TOC", () => {
  const sections = webMcpSections("# Title\n\nPreamble\n\n## Short\n\nHi\n\n### Child\n\n```md\n## Not a heading\n```\n\n## Short\n\n## Empty", "Title");
  assert.deepEqual(sections.map(({ id, depth }) => ({ id, depth })), [
    { id: "short", depth: 2 }, { id: "child", depth: 3 }, { id: "short-2", depth: 2 }, { id: "empty", depth: 2 },
  ]);
  assert.match(sections[0].body, /Hi/);
  assert.match(sections[0].body, /### Child/);
  assert.equal(sections[2].body, "");
  assert.deepEqual(webMcpSections("Plain content without headings", "Title"), []);
});

test("published dates are preserved without inventing dates for undated pages", () => {
  assert.equal(webMcpUpdated(normalizeConcept({ type: "article", updated: "2026-10-02" }, "", "Title")), "2026-10-02T00:00:00.000Z");
  assert.equal(webMcpUpdated(normalizeConcept({ type: "article", timestamp: "2026-09-01" }, "", "Title")), "2026-09-01T00:00:00.000Z");
  assert.equal(webMcpUpdated(normalizeConcept({ type: "article", updated: "invalid" }, "", "Title")), undefined);
  assert.equal(webMcpUpdated(normalizeConcept({ type: "article" }, "", "Title")), undefined);
});

const article = normalizeConcept({ type: "article", title: "Guide", tags: ["webmcp"],
  digitalSourceType: "trainedAlgorithmicMedia", aiDisclosureNote: "AI draft reviewed by a person",
  generated: { by: "tool:example", at: "2026-10-01T00:00:00Z" },
  verified: [{ by: "person:reviewer", at: "2026-10-02T00:00:00Z" }],
  sources: [{ resource: "https://source.example/page", title: "Source" }],
  private_custom: "must not leak", status: "stable", stale_after: "2027-01-01",
}, "## Short\n\nComplete body", "Guide");
const dataset = normalizeConcept({ type: "dataset", title: "Data", license: "CC-BY-4.0",
  description: "Open data", publisher: { name: "Office" },
  distributions: [{ title: "Table", format: "csv", accessURL: "/data.csv", downloadURL: "data.csv", byteSize: 100 }],
}, "Dataset body", "Data");
const fallbackDataset = normalizeConcept({ type: "dataset", title: "Fallback" }, "Body", "Fallback");
const ir = buildKnowledgeIr([
  { slug: "en/guide", concept: article }, { slug: "data", concept: dataset }, { slug: "fallback", concept: fallbackDataset },
], { sourcePathByConceptId: new Map([["article/en/guide", "en/guide.md"], ["dataset/data", "data.md"], ["dataset/fallback", "fallback.md"]]) });
const opts = {
  sourceToUrl: (source: string) => source.replace(/\.md$/, ".html"),
  metadataBySource: new Map([["en/guide.md", { lang: "en", updated: "2026-10-02T00:00:00Z" }]]),
  machineReadable: true,
  packs: [{ id: "guides", path: "okf/guides.okfc", concept_count: 1, pages: ["en/guide.html"] }],
};

test("content projection publishes only explicitly enabled features, including body opt-in", () => {
  for (const webmcp of [false, true, {}]) {
    const data = buildWebMcpContent(ir, { ...opts, webmcp });
    assert.ok(data.pages.every((page) => !("body" in page) && !("sections" in page) && !("dataset" in page)));
    assert.deepEqual(data.packs, []);
  }
  const data = buildWebMcpContent(ir, { ...opts, webmcp: { read_page: true } });
  const page = data.pages.find((page) => page.doc_type === "article")!;
  assert.equal(page.url, "en/guide.html");
  assert.match(page.body!, /Complete body/);
  assert.equal(page.sections![0].body, "Complete body");
  assert.equal(page.sources![0].resource, "https://source.example/page");
  assert.equal(page.verified![0].by, "person:reviewer");
  assert.equal(page.generated!.by, "tool:example");
  assert.equal(page.ai_disclosure!.digitalSourceCode, "trainedAlgorithmicMedia");
  assert.doesNotMatch(JSON.stringify(data), /private_custom|must not leak/);
  const undisclosed = buildWebMcpContent(ir, { ...opts, machineReadable: false, webmcp: { read_page: true } });
  assert.ok(undisclosed.pages.every((page) => !("ai_disclosure" in page)));
});

test("dataset projection respects publisher and license fallback, with no body unless opted in", () => {
  const data = buildWebMcpContent(ir, { ...opts, webmcp: { datasets: true, knowledge_packs: true },
    defaultLicense: "CC0-1.0", publisher: { name: "Site office" } });
  const page = data.pages.find((page) => page.title === "Data")!;
  assert.equal(page.dataset!.license!.id, "CC-BY-4.0");
  assert.equal(page.dataset!.publisher!.name, "Office");
  assert.equal(page.dataset!.distributions[0].media_type, "text/csv");
  assert.equal(page.dataset!.distributions[0].byteSize, 100);
  const fallback = data.pages.find((page) => page.title === "Fallback")!;
  assert.equal(fallback.dataset!.license!.id, "CC0-1.0");
  assert.equal(fallback.dataset!.publisher!.name, "Site office");
  assert.ok(data.pages.every((page) => !("body" in page)));
  assert.deepEqual(data.packs, opts.packs);
  const missing = buildWebMcpContent(ir, { ...opts, webmcp: { datasets: true } });
  assert.equal(missing.pages.find((page) => page.title === "Fallback")!.dataset!.license, undefined);
});
