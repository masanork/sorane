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
import {
  compileGraphvizToSvg,
  isGraphvizCompileEnabled,
  isGraphvizLang,
  resolveGraphvizBinary,
} from "./compile-graphviz.ts";
import {
  compileMermaidToSvg,
  isMermaidBuildEnabled,
  resolveMmdcBinary,
} from "./compile-mermaid.ts";
import { extractAltText } from "./parse-diagram-fence.ts";
import {
  remarkInjectBuiltFigures,
  type InjectedBuiltFigure,
} from "./remark-inject-built-figures.ts";
import { remarkDiagramFences } from "./parse-diagram-fence.ts";
import { rehypeDiagramPre } from "./rehype-diagram-pre.ts";
import type {
  RenderOptions,
  RenderedMarkdown,
  TocEntry,
} from "../render.ts";
import { rewriteLinks } from "../render.ts";
import { buildSanitizeSchema } from "../markup/sanitize-schema.ts";
import { rehypeFilterEmbeds } from "../markup/rehype-filter-embeds.ts";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SlugLedger } from "../heading-slug.ts";
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
  readonly mermaidOutDir?: string;
  readonly graphvizOutDir?: string;
  readonly onDiagramWarning?: (message: string) => void;
}

async function compileBuiltFigures(
  tree: Root,
  diagramConfig: DiagramsConfig,
  opts: AsyncRenderOptions,
): Promise<ReadonlyMap<Code, InjectedBuiltFigure>> {
  const figures = new Map<Code, InjectedBuiltFigure>();
  const rootPrefix = opts.rootPrefix ?? "./";
  const warn = opts.onDiagramWarning;

  if (isD2CompileEnabled(diagramConfig) && opts.d2OutDir) {
    const binary = resolveD2Binary(diagramConfig);
    const d2Nodes: Code[] = [];
    visit(tree, "code", (node) => {
      if (node.lang === "d2") d2Nodes.push(node);
    });
    for (const node of d2Nodes) {
      const alt = extractAltText(node.meta, node.value) ?? "Diagram";
      const result = await compileD2ToSvg({
        source: node.value,
        binary,
        outDir: opts.d2OutDir,
      });
      if (!result.ok) {
        warn?.(
          `diagrams: d2 compile failed (${result.hash.slice(0, 8)}…): ${result.warning ?? "unknown error"}`,
        );
        continue;
      }
      figures.set(node, {
        src: `${rootPrefix}assets/diagrams/d2/${result.svgFileName}`,
        alt,
        variant: "d2",
      });
    }
  }

  if (isMermaidBuildEnabled(diagramConfig) && opts.mermaidOutDir) {
    const binary = resolveMmdcBinary(diagramConfig);
    const mermaidNodes: Code[] = [];
    visit(tree, "code", (node) => {
      if (node.lang === "mermaid") mermaidNodes.push(node);
    });
    for (const node of mermaidNodes) {
      const alt = extractAltText(node.meta, node.value) ?? "Diagram";
      const result = await compileMermaidToSvg({
        source: node.value,
        binary,
        outDir: opts.mermaidOutDir,
      });
      if (!result.ok) {
        warn?.(
          `diagrams: mermaid build failed (${result.hash.slice(0, 8)}…): ${result.warning ?? "unknown error"}`,
        );
        continue;
      }
      figures.set(node, {
        src: `${rootPrefix}assets/diagrams/mermaid/${result.svgFileName}`,
        alt,
        variant: "mermaid",
      });
    }
  }

  if (isGraphvizCompileEnabled(diagramConfig) && opts.graphvizOutDir) {
    const binary = resolveGraphvizBinary(diagramConfig);
    const gvNodes: Code[] = [];
    visit(tree, "code", (node) => {
      if (isGraphvizLang(node.lang)) gvNodes.push(node);
    });
    for (const node of gvNodes) {
      const alt = extractAltText(node.meta, node.value) ?? "Diagram";
      const result = await compileGraphvizToSvg({
        source: node.value,
        binary,
        outDir: opts.graphvizOutDir,
      });
      if (!result.ok) {
        warn?.(
          `diagrams: graphviz compile failed (${result.hash.slice(0, 8)}…): ${result.warning ?? "unknown error"}`,
        );
        continue;
      }
      figures.set(node, {
        src: `${rootPrefix}assets/diagrams/graphviz/${result.svgFileName}`,
        alt,
        variant: "graphviz",
      });
    }
  }

  return figures;
}

/** Markdown 本文を非同期で変換する（ビルド時コンパイルバックエンド用）。 */
export async function renderMarkdownDocumentAsync(
  markdown: string,
  opts?: AsyncRenderOptions,
): Promise<RenderedMarkdown> {
  const diagramConfig = opts?.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
  const outline: TocEntry[] = [];
  const diagrams: DiagramRenderMeta = { mermaid: 0, d2: 0, graphviz: 0 };

  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDiagramFences(diagramConfig))
    .parse(rewriteLinks(markdown)) as Root;

  Object.assign(diagrams, countDiagramsForConfig(tree, diagramConfig));
  const builtFigures = await compileBuiltFigures(tree, diagramConfig, opts ?? {});

  const schema = buildSanitizeSchema(opts?.sanitize);
  const allowEmbeds = opts?.sanitize?.strictHtml !== true;
  const processor = unified()
    .use(remarkInjectBuiltFigures(builtFigures))
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
    .use(rehypeCollectOutline(outline));
  if (allowEmbeds) processor.use(rehypeFilterEmbeds);
  processor.use(rehypeSanitize, schema).use(rehypeStringify);

  const html = processor
    .stringify(processor.runSync(tree))
    .toString()
    .replace(/\r\n?/g, "\n")
    .trimEnd();

  return {
    html: html.length > 0 ? `${html}\n` : "",
    outline,
    diagrams,
  };
}