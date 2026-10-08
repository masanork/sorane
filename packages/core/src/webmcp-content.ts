import type { KnowledgeIr, OkfConcept } from "@sorane/okf";
import { parseAiDisclosure } from "./ai-disclosure.ts";
import { resolveWebMcpConfig, type SearchConfig } from "./config.ts";
import { SlugLedger } from "./heading-slug.ts";
import { processMarkdownToMdast } from "./markup/process-markdown.ts";
import { mdastNodeToPlainText } from "./markup/mdast-plaintext.ts";
import { stripDuplicateTitleHeading } from "./render.ts";
import { parseDistributions, parsePublisher, resolveLicenseUrl, resolveMediaType } from "./open-data.ts";

export interface WebMcpPageMetadata {
  readonly lang: string;
  readonly updated?: string;
}

export interface WebMcpPack {
  readonly id: string;
  readonly path: string;
  readonly title?: string;
  readonly description?: string;
  readonly concept_count: number;
  readonly pages: readonly string[];
}

/** Publication dates only; never substitute the build time for missing metadata. */
export function webMcpUpdated(concept: OkfConcept): string | undefined {
  const value = concept.frontmatter.updated ?? concept.timestamp;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

/** Complete sections, including short/empty ones that search deliberately omits. */
export function webMcpSections(body: string, title: string) {
  const markdown = stripDuplicateTitleHeading(body, title);
  const tree = processMarkdownToMdast(markdown);
  const ledger = new SlugLedger();
  const headings = tree.children.filter((node) => node.type === "heading").map((node) => {
    const text = mdastNodeToPlainText(node).trim();
    return { id: ledger.next(text), title: text, depth: node.depth,
      start: node.position!.start.offset!, end: node.position!.end.offset! };
  });
  return headings.map((heading, i) => {
    // A section includes descendants until the next heading of equal or smaller depth.
    const next = headings.slice(i + 1).find((candidate) => candidate.depth <= heading.depth);
    return { id: heading.id, title: heading.title, depth: heading.depth,
      body: markdown.slice(heading.end, next?.start ?? markdown.length).trim() };
  });
}

/** Project the shared content IR into opt-in public data, never a DOM scrape. */
export function buildWebMcpContent(ir: KnowledgeIr, opts: {
  readonly webmcp: SearchConfig["webmcp"];
  readonly sourceToUrl: (source: string) => string;
  readonly metadataBySource: ReadonlyMap<string, WebMcpPageMetadata>;
  readonly machineReadable: boolean;
  readonly defaultLicense?: string;
  readonly publisher?: unknown;
  readonly packs: readonly WebMcpPack[];
}) {
  const features = resolveWebMcpConfig(opts.webmcp);
  const pages = ir.concepts.map((entry) => {
    const c = entry.concept;
    const source = entry.source_path!;
    const metadata = opts.metadataBySource.get(source);
    const disclosure = opts.machineReadable ? parseAiDisclosure(c.frontmatter) : null;
    const license = typeof c.frontmatter.license === "string" ? c.frontmatter.license : opts.defaultLicense;
    return {
      url: opts.sourceToUrl(source), title: c.title, doc_type: c.type,
      lang: metadata?.lang, timestamp: c.timestamp, updated: metadata?.updated, tags: c.tags ?? [],
      ...(features.read_page ? {
        body: entry.pack.body, body_format: entry.pack.body_format,
        sections: webMcpSections(c.body, c.title),
        sources: c.sources ?? [], verified: c.verified ?? [],
        generated: c.generated, status: c.status, stale_after: c.stale_after,
        ...(disclosure ? { ai_disclosure: disclosure } : {}),
      } : {}),
      ...(features.datasets && c.type === "dataset" ? { dataset: {
        description: c.description,
        license: license ? { id: license, url: resolveLicenseUrl(license) } : undefined,
        publisher: parsePublisher(c.frontmatter.publisher) ?? parsePublisher(opts.publisher),
        distributions: parseDistributions(c.frontmatter.distributions).map((distribution) => ({
          ...distribution, media_type: resolveMediaType(distribution.format),
        })),
      } } : {}),
    };
  });
  return {
    schema_version: 1,
    features: { read_page: features.read_page, datasets: features.datasets, knowledge_packs: features.knowledge_packs },
    pages,
    packs: features.knowledge_packs ? opts.packs : [],
  };
}
