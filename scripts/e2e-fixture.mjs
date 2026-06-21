import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSearchIndex } from "../packages/search/src/build-index.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig } from "../packages/core/src/config.ts";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Playwright 用の最小サイトをビルドする。 */
export async function buildE2eFixture(root, outDir) {
  const contentDir = join(root, "content");
  const staticDir = join(root, "static");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(staticDir, { recursive: true });

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
    embeddings: null,
  });

  await runBuild({
    cwd: root,
    config: mergeConfig({
      site: {
        title: "E2E",
        description: "fixture",
        base_url: "https://e2e.example.test",
        lang: "en",
        og_image: "/static/pixel.png",
      },
      build: {
        content_dir: "content",
        out_dir: outDir,
        static_dir: "static",
        diagrams: { enabled: true },
      },
      search: { index: ".sorane/index.db", mode: "fts" },
    }),
    clean: true,
  });
}