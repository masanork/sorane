import { describe, expect, test } from "./_expect.ts";
import {
  conceptToOkfMarkdown,
  formatScalar,
  normalizeConcept,
  toOkfFrontmatterLines,
} from "../packages/okf/src/index.ts";

describe("formatScalar", () => {
  test("boolean / number", () => {
    expect(formatScalar(true)).toBe("true");
    expect(formatScalar(42)).toBe("42");
  });

  test("空文字は quoted empty", () => {
    expect(formatScalar("")).toBe("''");
  });

  test("特殊文字はクォート", () => {
    expect(formatScalar(" yes")).toBe("' yes'");
    expect(formatScalar("key: value")).toBe("'key: value'");
    expect(formatScalar("true")).toBe("'true'");
    expect(formatScalar("2025")).toBe("'2025'");
    expect(formatScalar("#comment")).toBe("'#comment'");
  });

  test("プレーン文字列はそのまま", () => {
    expect(formatScalar("hello")).toBe("hello");
  });
});

describe("toOkfFrontmatterLines", () => {
  test("AI disclosure と aiSystems", () => {
    const concept = normalizeConcept(
      {
        type: "article",
        title: "T",
        profile: "sorane-okf/0.3",
        digitalSourceType: "trainedAlgorithmicMedia",
        euAiLabel: "fully-generated",
        aiDisclosureNote: "note",
        aiSystems: [{ name: "GPT", version: "4", provider: "OpenAI" }],
        customField: { nested: "x" },
      },
      "body",
      "t",
    );
    const lines = toOkfFrontmatterLines(concept);
    expect(lines.join("\n")).toContain("digitalSourceType:");
    expect(lines.join("\n")).toContain("euAiLabel:");
    expect(lines.join("\n")).toContain("aiSystems:");
    expect(lines.join("\n")).toContain("customField:");
  });

  test("空 tags は出力しない", () => {
    const concept = normalizeConcept({ type: "article", title: "T" }, "body", "t");
    const lines = toOkfFrontmatterLines(concept);
    expect(lines.some((l) => l.startsWith("tags:"))).toBe(false);
  });
});

describe("conceptToOkfMarkdown", () => {
  test("frontmatter + body", () => {
    const concept = normalizeConcept({ type: "article", title: "Hi" }, "Hello.\n", "hi");
    const md = conceptToOkfMarkdown(concept);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("title: Hi");
    expect(md.endsWith("Hello.\n")).toBe(true);
  });
});