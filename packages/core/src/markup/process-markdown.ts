import type { Root as MdastRoot } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { DiagramsConfig } from "../config.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../config.ts";
import { remarkDiagramFences } from "../diagrams/parse-diagram-fence.ts";
import { parseRubyPlugin } from "../ruby/parse-ruby.ts";
import type { GlossaryLinkIndex } from "./glossary-link-index.ts";
import { parseTermLinkPlugin } from "./parse-term-link.ts";
import { resolveTermLinksPlugin } from "./resolve-term-links.ts";

export interface ProcessMarkdownOptions {
  readonly diagrams?: DiagramsConfig;
  readonly glossaryIndex?: GlossaryLinkIndex;
}

/** Markdown 本文を mdast にパースする（diagram フェンス注釈込み）。 */
export function processMarkdownToMdast(
  markdown: string,
  opts?: ProcessMarkdownOptions,
): MdastRoot {
  const diagramConfig = opts?.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(parseRubyPlugin)
    .use(parseTermLinkPlugin)
    .use(resolveTermLinksPlugin(opts?.glossaryIndex))
    .use(remarkDiagramFences(diagramConfig));
  const tree = processor.parse(markdown) as MdastRoot;
  return processor.runSync(tree) as MdastRoot;
}