import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  renderMarkdown,
  stripDuplicateTitleHeading,
} from "../packages/core/src/render.ts";
import { renderArticleBody } from "../packages/core/src/ssg.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

describe("renderMarkdown", () => {
  test("はてな移行 HTML を本文として描画する", () => {
    const body = readFileSync(
      join(import.meta.dirname, "../../blog/content/2007-05-06.md"),
      "utf8",
    )
      .split("---")
      .slice(2)
      .join("---")
      .trim();
    const html = renderMarkdown(body);
    expect(html).toContain("<p>すごく本質的な批判");
    expect(html).toContain("<blockquote");
    expect(html).toContain('class="keyword"');
    expect(html.includes("<script")).toBe(false);
  });

  test("通常の Markdown も描画する", () => {
    const html = renderMarkdown("# Hello\n\nPlain **text**.\n");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>text</strong>");
  });
});

describe("stripDuplicateTitleHeading", () => {
  test("タイトルと一致する先頭 h1 を除く", () => {
    const body = stripDuplicateTitleHeading("# Title\n\n<p>Body</p>\n", "Title");
    expect(body).toBe("<p>Body</p>\n");
  });

  test("別タイトルは残す", () => {
    const body = stripDuplicateTitleHeading("# Other\n\nBody\n", "Title");
    expect(body.startsWith("# Other")).toBe(true);
  });
});

describe("renderArticleBody", () => {
  test("はてな移行記事で本文 HTML を出し h1 は1つ", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "../../blog/content/2007-05-06.md"),
      "utf8",
    );
    const body = raw.split("---").slice(2).join("---").trim();
    const concept = normalizeConcept(
      { type: "article", title: "嘘をつく理由" },
      body,
      "2007-05-06",
    );
    const html = renderArticleBody(concept);
    expect(html.match(/<h1>/g)?.length).toBe(1);
    expect(html).toContain("<p>すごく本質的な批判");
    expect(html.includes("<h1>嘘をつく理由</h1>")).toBe(true);
  });
});