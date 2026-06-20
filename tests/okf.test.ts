import { describe, expect, test } from "./_expect.ts";
import {
  conceptToOkfMarkdown,
  normalizeConcept,
  validateSource,
} from "../packages/okf/src/index.ts";

describe("normalizeConcept", () => {
  test("layout/date を type/timestamp に昇格", () => {
    const c = normalizeConcept(
      { layout: "article", date: "2025-01-01", title: "T" },
      "body",
      "fb",
    );
    expect(c.type).toBe("article");
    expect(c.timestamp).toBe("2025-01-01T00:00:00Z");
    expect(c.warnings.length > 0).toBe(true);
  });
});

describe("validateSource", () => {
  test("article は type + title 必須", () => {
    const ok = validateSource(
      "a.md",
      "---\ntype: article\ntitle: Hello\n---\n\nbody\n",
    );
    expect(ok.ok).toBe(true);
    const bad = validateSource("a.md", "---\ntype: playbook\n---\n\nbody\n");
    expect(bad.ok).toBe(false);
  });

  test("frontmatter 無しはエラー", () => {
    const r = validateSource("a.md", "no frontmatter\n");
    expect(r.ok).toBe(false);
  });
});

describe("conceptToOkfMarkdown", () => {
  test("旧キーを出力しない", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "T",
        timestamp: "2025-01-01T00:00:00Z",
        layout: "article",
        date: "2025-01-01",
      },
      "Hello\n",
      "fb",
    );
    const md = conceptToOkfMarkdown(c);
    expect(md).toContain("type: article");
    expect(md).toContain("timestamp: 2025-01-01T00:00:00Z");
    expect(md).not.toMatch(/layout:/);
    expect(md).not.toMatch(/date:/);
  });

  test("AI disclosure フィールドを出力する", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "AI",
        profile: "sorane-okf/0.2",
        digitalSourceType: "compositeWithTrainedAlgorithmicMedia",
        euAiLabel: "partially-modified",
        aiDisclosureNote: "Verified.",
        aiSystems: [{ name: "Claude", provider: "Anthropic" }],
      },
      "Body\n",
      "ai",
    );
    const md = conceptToOkfMarkdown(c);
    expect(md).toContain("digitalSourceType: compositeWithTrainedAlgorithmicMedia");
    expect(md).toContain("euAiLabel: partially-modified");
    expect(md).toContain("aiDisclosureNote: Verified.");
    expect(md).toContain("aiSystems:");
    expect(md).toContain("name: Claude");
    expect(md).toContain("provider: Anthropic");
  });
});