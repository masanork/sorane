import { describe, expect, test } from "./_expect.ts";
import {
  renderDocsArticleFromConcept,
  renderDocsArticleFromConceptWithMeta,
} from "../packages/core/src/docs.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("renderDocsArticleFromConceptWithMeta", () => {
  test("docs ページで mermaid メタを返す", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Docs diagram", excludeFromList: true },
      "## Section\n\nText.\n\n## Another\n\n```mermaid alt=\"Docs\"\nsequenceDiagram\n  A->>B: hi\n```\n",
      "docs-diagram",
    );
    const { bodyHtml, diagrams } = renderDocsArticleFromConceptWithMeta(
      concept,
      undefined,
      "ja",
      { diagrams: DEFAULT_DIAGRAMS_CONFIG },
    );
    expect(diagrams.mermaid).toBe(1);
    expect(bodyHtml).toContain("language-mermaid");
    expect(bodyHtml).toContain('class="page-toc"');
  });
});

describe("renderDocsArticleFromConcept", () => {
  test("diagram 無しでは loader 用メタゼロ", () => {
    const concept = normalizeConcept(
      { type: "article", title: "Plain", excludeFromList: true },
      "## One\n\nBody\n",
      "plain",
    );
    const meta = renderDocsArticleFromConceptWithMeta(concept, undefined, "ja", {
      diagrams: DEFAULT_DIAGRAMS_CONFIG,
    });
    expect(meta.diagrams.mermaid).toBe(0);
    const html = renderDocsArticleFromConcept(concept, undefined, "ja", {
      diagrams: DEFAULT_DIAGRAMS_CONFIG,
    });
    expect(html).toContain("Plain");
  });
});