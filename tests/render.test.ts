import { describe, expect, test } from "./_expect.ts";
import {
  escapeHtml,
  renderMarkdown,
  rewriteLinks,
  stripDuplicateTitleHeading,
} from "../packages/core/src/render.ts";
import { renderArticleBody } from "../packages/core/src/ssg.ts";
import { normalizeConcept } from "../packages/okf/src/index.ts";

const hatenaBody = `# 嘘をつく理由

<p>すごく本質的な批判を孕むトラバをいただいた．全くご指摘の通りだ．</p>
<blockquote><p>非難されるであろうという予期を「やってはいけないことをやっている自覚」とみなすなら、その論理は宗教、<a class="keyword" href="http://d.hatena.ne.jp/keyword/test">性的指向</a>、性同一性、思想信条による差別を肯定する。</p>
</blockquote>
`;

describe("rewriteLinks", () => {
  test(".md を .html に書き換える", () => {
    expect(rewriteLinks("[x](./a.md)")).toContain("a.html");
    expect(rewriteLinks("[x](https://ex.dev/a.md)")).toContain("a.md");
    expect(rewriteLinks("[x](#sec)")).toContain("#sec");
  });
});

describe("escapeHtml", () => {
  test("特殊文字をエスケープする", () => {
    expect(escapeHtml(`<a>&"`)).toBe("&lt;a&gt;&amp;&quot;");
  });
});

describe("renderMarkdown", () => {
  test("はてな移行 HTML を本文として描画する", () => {
    const html = renderMarkdown(hatenaBody);
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
    const concept = normalizeConcept(
      { type: "article", title: "嘘をつく理由" },
      hatenaBody,
      "2007-05-06",
    );
    const html = renderArticleBody(concept);
    expect(html.match(/<h1>/g)?.length).toBe(1);
    expect(html).toContain("<p>すごく本質的な批判");
    expect(html.includes("<h1>嘘をつく理由</h1>")).toBe(true);
  });
});