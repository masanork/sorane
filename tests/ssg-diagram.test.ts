import { describe, expect, test } from "./_expect.ts";
import {
  buildPage,
  renderArticleBodyWithMeta,
} from "../packages/core/src/ssg.ts";
import { diagramHeadForPage } from "../packages/core/src/diagrams/diagram-meta.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

const MERMAID_BODY = `# Diagram post

\`\`\`mermaid alt="Simple flow"
flowchart LR
  A --> B
\`\`\`
`;

const DIAGRAMS_ON = { ...DEFAULT_DIAGRAMS_CONFIG, enabled: true };

describe("renderArticleBodyWithMeta", () => {
  test("mermaid フェンスの diagrams メタを返す", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Diagram post" },
      MERMAID_BODY,
      "diagram-post",
    );
    const { bodyHtml, diagrams } = renderArticleBodyWithMeta(concept, undefined, {
      diagrams: DIAGRAMS_ON,
    });
    expect(diagrams.mermaid).toBe(1);
    expect(bodyHtml).toContain("language-mermaid");
    expect(bodyHtml).toContain("data-sorane-alt");
  });
});

describe("buildPage (diagram extraHead)", () => {
  test("diagramHead を head に挿入できる", () => {
    const head = diagramHeadForPage(
      { mermaid: 1, d2: 0, graphviz: 0 },
      "./",
      DIAGRAMS_ON,
    )!;
    const html = buildPage({
      title: "T",
      siteTitle: "Site",
      bodyHtml: "<p>x</p>",
      rootPrefix: "./",
      extraHead: [head],
    });
    expect(html).toContain("sorane-mermaid-loader.mjs");
  });
});