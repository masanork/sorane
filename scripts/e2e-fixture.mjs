import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSearchIndex } from "../packages/search/src/build-index.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Playwright 用の最小サイトをビルドする。 */
export async function buildE2eFixture(root, outDir, { webmcp = true, snippetOnly = false, extended = !snippetOnly } = {}) {
  const contentDir = join(root, "content");
  const staticDir = join(root, "static");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(staticDir, { recursive: true });
  mkdirSync(join(contentDir, "en"), { recursive: true });

  writeFileSync(
    join(contentDir, "index.md"),
    `---
type: index
title: E2E Site
profile: sorane-okf/0.1
---

Welcome to the E2E fixture.
`,
  );

  writeFileSync(
    join(contentDir, "diagram.md"),
    `---
type: article
title: E2E Mermaid
profile: sorane-okf/0.1
---

\`\`\`mermaid alt="E2E flow"
flowchart LR
  A[Markdown] --> B[Mermaid loader]
  B --> C[SVG figure]
\`\`\`
`,
  );

  writeFileSync(
    join(contentDir, "404.md"),
    `---
type: article
title: Not Found
profile: sorane-okf/0.1
excludeFromList: true
---

This page is only for E2E.
`,
  );

  writeFileSync(join(staticDir, "pixel.png"), TINY_PNG);

  writeFileSync(join(contentDir, "en", "webmcp.md"), `---
type: article
title: WebMCP Guide
digitalSourceType: digitalCreation
tags: [webmcp, testing]
timestamp: "2026-09-01"
updated: "2026-10-02"
sources:
  - resource: https://developer.chrome.com/docs/ai/webmcp
    title: Chrome WebMCP documentation
verified:
  - by: person:reviewer
    at: "2026-10-03T00:00:00Z"
---

## Search contract

WebMCP contractneedle returns the same published sections to people and agents, including nested heading links.

## More examples

WebMCP contractneedle can find a second section with useful examples for testing result limits and ordering.
`);
  writeFileSync(join(contentDir, "kana.md"), `---
type: article
title: データセットの案内
tags: [データ, webmcp]
lang: ja
updated: "2026-10-01"
---

## カタログ

データセットをカタログから探せます。全角ＷｅｂＭＣＰも同じキーワードとして検索できます。
`);
  writeFileSync(join(contentDir, "data.md"), `---
type: dataset
profile: sorane-okf/0.3
title: Example dataset
resource: https://e2e.example.test/data
description: Public statistics for datasetneedle testing.
license: CC-BY-4.0
publisher:
  name: Example Office
  url: https://publisher.example.test
distributions:
  - title: CSV table
    format: csv
    accessURL: /static/example.csv
    byteSize: 14
    checksum: sha256:example
  - title: JSON API
    format: json
    accessURL: https://data.example.test/api
    downloadURL: https://data.example.test/download.json
---

## About this data

This datasetneedle contains a small public table for testing published distribution metadata.
`);
  writeFileSync(join(staticDir, "example.csv"), "name,count\na,1");
  writeFileSync(join(contentDir, "contact.md"), `---
type: article
title: Contact
---

<!-- test-contact -->
`);
  writeFileSync(join(contentDir, "kototoi.md"), "---\ntype: article\ntitle: Kototoi contact\n---\n\nContact integration fixture.\n");
  writeFileSync(join(staticDir, "kototoi-form.js"), readFileSync(new URL("../website/static/kototoi-form.js", import.meta.url)));
  writeFileSync(join(contentDir, "faq.md"), `---
type: faq
title: WebMCP FAQ
profile: sorane-okf/0.3
digitalSourceType: trainedAlgorithmicMedia
---

## How does search work?

WebMCP contractneedle searches published content with optional type and source filters.
`);
  writeFileSync(join(contentDir, "draft.md"), `---
type: article
title: Unpublished contractneedle
draft: true
---

WebMCP contractneedle draftsecret must never appear in public search responses, even though authors keep it locally.
`);

  writeFileSync(
    join(contentDir, "search.md"),
    `---
type: article
title: Search
view: search
profile: sorane-okf/0.1
---

Search the E2E fixture for Welcome and Mermaid keywords.
`,
  );

  const indexPath = join(root, ".sorane", "index.db");
  await buildSearchIndex({
    contentDir,
    indexPath,
    force: true,
  });

  await runBuild({
    cwd: root,
    config: mergeConfig({
      site: {
        title: "E2E",
        description: "fixture",
        base_url: "https://e2e.example.test",
        lang: "en",
        i18n: { locales: { en: { lang: "en", path_prefix: "en" } } },
        og_image: "/static/pixel.png",
      },
      build: {
        content_dir: "content",
        out_dir: outDir,
        static_dir: "static",
        diagrams: { enabled: true },
        security: { search_snippet_only: snippetOnly },
        outputs: { okfc: true },
        okfc: { units: [{ id: "guides", title: "English guides", match: { dirs: ["en"] } }] },
      },
      search: { index: ".sorane/index.db", webmcp: webmcp && extended
        ? { read_page: true, datasets: true, knowledge_packs: true, contact: true } : webmcp },
    }),
    clean: true,
  });
  const contactPath = join(outDir, "contact.html");
  writeFileSync(contactPath, readFileSync(contactPath, "utf8").replace("</main>", `
    <form data-webmcp-contact method="post" action="/contact-submit">
      <label>Name<input name="name" maxlength="200"></label>
      <label>Subject<input name="subject" maxlength="200" required></label>
      <label>Message<textarea name="body" maxlength="8000" required></textarea></label>
      <input type="hidden" name="csrf" value="private-token">
      <button type="submit">Send</button>
    </form></main>`));
  const kototoiPath = join(outDir, "kototoi.html");
  const kototoiConfig = { endpoint: "/kototoi-test", siteId: "fixture", form: { fields: [
    { id: "name", label: "Name", type: "text", required: true, max_length: 200 },
    { id: "body", label: "Message", type: "textarea", required: true, max_length: 8000 },
  ] } };
  writeFileSync(kototoiPath, readFileSync(kototoiPath, "utf8")
    .replace("</main>", `<div data-kototoi-auto data-webmcp-contact data-kototoi-config='${JSON.stringify(kototoiConfig)}'></div></main>`)
    .replace("</body>", '<script src="./static/kototoi-form.js" defer></script></body>'));
}
