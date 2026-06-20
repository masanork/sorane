import type { Code, Root } from "mdast";
import type { DiagramsConfig } from "../config.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../config.ts";
import {
  countDiagramsForConfig,
  type DiagramRenderMeta,
} from "./diagram-meta.ts";
import {
  compileD2ToSvg,
  isD2CompileEnabled,
  resolveD2Binary,
} from "./compile-d2.ts";
import { extractAltText } from "./parse-diagram-fence.ts";
import { remarkInjectD2Figures } from "./remark-inject-d2.ts";
import { remarkDiagramFences } from "./parse-diagram-fence.ts";
import { rehypeDiagramPre } from "./rehype-diagram-pre.ts";
import type {
  RenderOptions,
  RenderedMarkdown,
  TocEntry,
} from "../render.ts";
import { rewriteLinks, sanitizeSchema } from "../render.ts";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SlugLedger } from "@sorane/search";
import type { Root as HastRoot } from "hast";
import { visit } from "unist-util-visit";

function hastToPlainText(node: {
  type?: string;
  value?: string;
  children?: unknown[];
}): string {
  if (node.type === "text" && typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children
    .map((child) =>
      hastToPlainText(child as { type?: string; value?: string; children?: unknown[] }),
    )
    .join("");
}

function rehypeHeadingIds() {
  const ledger = new SlugLedger();
  return (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (!m) return;
      const text = hastToPlainText(node).trim();
      if (!text) return;
      node.properties ??= {};
      node.properties.id = ledger.next(text);
    });
  };
}

function rehypeCollectOutline(outline: TocEntry[]) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      const m = /^h([2-4])$/.exec(node.tagName);
      if (!m) return;
      const id = node.properties?.id;
      if (typeof id !== "string" || id.length === 0) return;
      const text = hastToPlainText(node)
        .replace(/\s*#\s*$/, "")
        .trim();
      if (!text) return;
      outline.push({ depth: Number(m[1]), id, text });
    });
  };
}

export interface AsyncRenderOptions extends RenderOptions {
  readonly rootPrefix?: string;
  readonly d2OutDir?: string;
  readonly onDiagramWarning?: (message: string) => void;
}

async function compileD2Figures(
  tree: Root,
  diagramConfig: DiagramsConfig,
  opts: AsyncRenderOptions,
): Promise<ReadonlyMap<Code, { src: string; alt: string }>> {
  const figures = new Map<Code, { src: string; alt: string }>();
  if (!isD2CompileEnabled(diagramConfig) || !opts.d2OutDir) return figures;

  const d2Nodes: Code[] = [];
  visit(tree, "code", (node) => {
    if (node.lang === "d2") d2Nodes.push(node);
  });

  const rootPrefix = opts.rootPrefix ?? "./";
  const binary = resolveD2Binary(diagramConfig);
  for (const node of d2Nodes) {
    const alt = extractAltText(node.meta, node.value) ?? "Diagram";
    const result = await compileD2ToSvg({
      source: node.value,
      binary,
      outDir: opts.d2OutDir,
    });
    if (!result.ok) {
      opts.onDiagramWarning?.(
        `diagrams: d2 compile failed (${result.hash.slice(0, 8)}…): ${result.warning ?? "unknown error"}`,
      );
      continue;
    }
    figures.set(node, {
      src: `${rootPrefix}assets/diagrams/d2/${result.svgFileName}`,
      alt,
    });
  }
  return figures;
}

/** Markdown 本文を非同期で変換する（`d2.enabled` 時に D2 フェンスを SVG へコンパイル）。 */
export async function renderMarkdownDocumentAsync(
  markdown: string,
  opts?: AsyncRenderOptions,
): Promise<RenderedMarkdown> {
  const diagramConfig = opts?.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
  const outline: TocEntry[] = [];
  const diagrams: DiagramRenderMeta = { mermaid: 0, d2: 0 };

  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDiagramFences(diagramConfig))
    .parse(rewriteLinks(markdown)) as Root;

  Object.assign(diagrams, countDiagramsForConfig(tree, diagramConfig));
  const d2Figures = await compileD2Figures(tree, diagramConfig, opts ?? {});

  const processor = unified()
    .use(remarkInjectD2Figures(d2Figures))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeDiagramPre)
    .use(rehypeHeadingIds)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: {
        className: ["heading-anchor"],
        ariaHidden: "true",
        tabIndex: -1,
      },
      content: { type: "text", value: "#" },
    })
    .use(rehypeCollectOutline(outline))
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);

  const html = processor
    .stringify(processor.runSync(tree))
    .replace(/\r\n?/g, "\n")
    .trimEnd();

  return {
    html: html.length > 0 ? `${html}\n` : "",
    outline,
    diagrams,
  };
}