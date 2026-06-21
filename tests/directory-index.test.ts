import { describe, expect, test } from "./_expect.ts";
import {
  directoryIndexBundlePath,
  directoryIndexOkfMarkdown,
  directoryIndexOutRel,
  discoverDirectoryIndexes,
  humanizeDirectoryLabel,
  renderDirectoryIndexBody,
} from "../packages/core/src/directory-index.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { resolveI18nContext } from "../packages/core/src/i18n.ts";
import { parseConcept } from "../packages/okf/src/index.ts";

const CFG = mergeConfig({
  build: { permalink: "{{slug}}.html" },
  site: { title: "Site", lang: "ja" },
} as Partial<SoraneConfig>);

function parse(rel: string, body: string) {
  return parseConcept("", rel, body, { defaultProfile: "sorane-okf/0.3" });
}

describe("discoverDirectoryIndexes", () => {
  test("サブディレクトリに index.md が無ければ検出", () => {
    const fm = (type: string, title: string) =>
      `---\ntype: ${type}\ntitle: ${title}\nprofile: sorane-okf/0.3\n---\n`;
    const parsed = [
      parse("datasets/a.md", `${fm("dataset", "A")}body`),
      parse("datasets/b.md", `${fm("reference", "B")}body`),
    ];
    const specs = discoverDirectoryIndexes(parsed, CFG, resolveI18nContext(CFG.site));
    expect(specs.length).toBe(1);
    expect(specs[0]!.dirRel).toBe("datasets");
    expect(specs[0]!.entries.length).toBe(2);
  });

  test("作者 index.md があるディレクトリはスキップ", () => {
    const parsed = [
      parse(
        "datasets/index.md",
        "---\ntype: index\ntitle: Datasets\nprofile: sorane-okf/0.3\n---\n",
      ),
      parse(
        "datasets/a.md",
        "---\ntype: dataset\ntitle: A\nprofile: sorane-okf/0.3\n---\n",
      ),
    ];
    const specs = discoverDirectoryIndexes(parsed, CFG, resolveI18nContext(CFG.site));
    expect(specs.length).toBe(0);
  });

  test("glossary/terms は glossary-term 一覧に任せる", () => {
    const fm = "---\ntype: glossary-term\ntitle: Term\nprofile: sorane-okf/0.3\n---\n";
    const parsed = [
      parse("glossary/terms/a.md", fm),
      parse("glossary/terms/b.md", fm),
    ];
    const specs = discoverDirectoryIndexes(parsed, CFG, resolveI18nContext(CFG.site));
    expect(specs.length).toBe(0);
  });
});

describe("directoryIndexOkfMarkdown", () => {
  test("frontmatter 無しの OKF 一覧", () => {
    const md = directoryIndexOkfMarkdown({
      dirRel: "datasets",
      localeId: "default",
      pathPrefix: "",
      entries: [
        { title: "Budget", href: "budget.html", type: "dataset", slug: "budget" },
      ],
    });
    expect(md.startsWith("# Datasets\n")).toBe(true);
    expect(md).toContain("[Budget](dataset/budget.md)");
    expect(md.includes("---")).toBe(false);
  });
});

describe("renderDirectoryIndexBody", () => {
  test("HTML 一覧と outRel", () => {
    const spec = {
      dirRel: "datasets",
      localeId: "default",
      pathPrefix: "",
      entries: [
        {
          title: "Budget",
          href: "budget.html",
          type: "dataset",
          slug: "budget",
          description: "CSV",
        },
      ],
    };
    expect(directoryIndexOutRel(spec)).toBe("datasets/index.html");
    expect(directoryIndexBundlePath(spec)).toBe("datasets/index.md");
    expect(humanizeDirectoryLabel("datasets")).toBe("Datasets");
    const html = renderDirectoryIndexBody(spec, "Site", "ja");
    expect(html.includes("directory-index")).toBe(true);
    expect(html).toContain("Budget");
    expect(html).toContain("dataset");
    expect(html).toContain("CSV");
  });
});