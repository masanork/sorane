import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiagramsConfig } from "../config.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../config.ts";
import { compileD2ToSvg, resolveD2Binary } from "../diagrams/compile-d2.ts";
import {
  compileGraphvizToSvg,
  isGraphvizCompileEnabled,
  resolveGraphvizBinary,
} from "../diagrams/compile-graphviz.ts";
import {
  compileMermaidToSvg,
  resolveMmdcBinary,
} from "../diagrams/compile-mermaid.ts";
import {
  compilePlantumlToSvg,
  isPlantumlCompileEnabled,
  resolvePlantumlKrokiUrl,
} from "../diagrams/compile-plantuml.ts";
import { escapeHtml } from "../render.ts";

const MAIN_CSS_LINK_RE =
  /(<link rel="stylesheet" href="([^"]*)assets\/main\.css">)/;

const SEARCH_SCRIPT_RE =
  /<script type="module" src="[^"]*assets\/search\.mjs"><\/script>\s*/g;

const MERMAID_LOADER_RE =
  /<script type="module" src="[^"]*assets\/diagrams\/sorane-mermaid-loader\.mjs"><\/script>\s*/g;

const DIAGRAM_PRE_RE =
  /<pre\b(?=[^>]*\bdata-sorane-alt="([^"]*)")[^>]*>\s*<code\b(?=[^>]*\blanguage-(mermaid|d2|graphviz|dot|plantuml|puml)\b)[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;

export interface PrepareHtmlForPdfOptions {
  readonly distDir?: string;
  readonly diagrams?: DiagramsConfig;
  /** Compile client diagram fences to inline SVG when tools are available (default on). */
  readonly prerenderDiagrams?: boolean;
}

function decodeHtmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function stripClientScripts(html: string): string {
  return html.replace(SEARCH_SCRIPT_RE, "").replace(MERMAID_LOADER_RE, "");
}

function injectPrintStylesheet(html: string): string {
  const m = MAIN_CSS_LINK_RE.exec(html);
  if (m === null) return html;
  const prefix = m[2]!;
  const printLink = `<link rel="stylesheet" href="${prefix}assets/print.css">`;
  return html.replace(m[1]!, `${m[1]}\n${printLink}`);
}

function diagramFallbackFigure(
  variant: string,
  alt: string,
  source: string,
): string {
  const escAlt = escapeHtml(alt);
  const escSource = escapeHtml(source);
  return (
    `<figure class="diagram diagram--fallback diagram--${variant}" role="img" aria-label="${escAlt}">` +
    `<p class="diagram-fallback-label"><em>${escAlt}</em></p>` +
    `<pre><code>${escSource}</code></pre>` +
    `</figure>`
  );
}

function inlineSvgFigure(variant: string, alt: string, svg: string): string {
  const escAlt = escapeHtml(alt);
  return (
    `<figure class="diagram diagram--${variant}" role="img" aria-label="${escAlt}">` +
    svg +
    `</figure>`
  );
}

function cliExists(binary: string): boolean {
  if (binary.includes("/") && !existsSync(binary)) return false;
  return true;
}

async function prerenderDiagramBlocks(
  html: string,
  distDir: string,
  config: DiagramsConfig,
): Promise<string> {
  const outDir = join(distDir, "assets", "diagrams", "pdf-export");
  const mmdc = resolveMmdcBinary(config);
  const d2Bin = resolveD2Binary(config);
  const dotBin = resolveGraphvizBinary(config);
  const krokiUrl = resolvePlantumlKrokiUrl(config);
  const mmdcOk = cliExists(mmdc);
  const d2Ok = cliExists(d2Bin);
  const graphvizOk = isGraphvizCompileEnabled(config) && cliExists(dotBin);
  const plantumlOk = isPlantumlCompileEnabled(config);

  const replacements: Array<{ from: string; to: string }> = [];
  let m: RegExpExecArray | null;
  DIAGRAM_PRE_RE.lastIndex = 0;
  while ((m = DIAGRAM_PRE_RE.exec(html)) !== null) {
    const full = m[0]!;
    const alt = m[1]!;
    const lang = m[2]!;
    const variant =
      lang === "dot" ? "graphviz" : lang === "puml" ? "plantuml" : lang;
    const source = decodeHtmlText(m[3]!.trim());

    if (variant === "mermaid" && mmdcOk) {
      const result = await compileMermaidToSvg({ source, binary: mmdc, outDir });
      if (result.ok) {
        const svgPath = join(outDir, result.svgFileName);
        if (existsSync(svgPath)) {
          replacements.push({
            from: full,
            to: inlineSvgFigure("mermaid", alt, readFileSync(svgPath, "utf8")),
          });
          continue;
        }
      }
    }

    if (variant === "d2" && d2Ok && config.d2?.enabled === true) {
      const result = await compileD2ToSvg({ source, binary: d2Bin, outDir });
      if (result.ok) {
        const svgPath = join(outDir, result.svgFileName);
        if (existsSync(svgPath)) {
          replacements.push({
            from: full,
            to: inlineSvgFigure("d2", alt, readFileSync(svgPath, "utf8")),
          });
          continue;
        }
      }
    }

    if (variant === "graphviz" && graphvizOk) {
      const result = await compileGraphvizToSvg({ source, binary: dotBin, outDir });
      if (result.ok) {
        const svgPath = join(outDir, result.svgFileName);
        if (existsSync(svgPath)) {
          replacements.push({
            from: full,
            to: inlineSvgFigure("graphviz", alt, readFileSync(svgPath, "utf8")),
          });
          continue;
        }
      }
    }

    if (variant === "plantuml" && plantumlOk) {
      const result = await compilePlantumlToSvg({ source, krokiUrl, outDir });
      if (result.ok) {
        const svgPath = join(outDir, result.svgFileName);
        if (existsSync(svgPath)) {
          replacements.push({
            from: full,
            to: inlineSvgFigure("plantuml", alt, readFileSync(svgPath, "utf8")),
          });
          continue;
        }
      }
    }

    replacements.push({ from: full, to: diagramFallbackFigure(variant, alt, source) });
  }

  let out = html;
  for (const { from, to } of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

/** Transform dist HTML for PDF rendering (sync: scripts + print.css only). */
export function prepareHtmlForPdf(html: string): string {
  return injectPrintStylesheet(stripClientScripts(html));
}

/** Full PDF HTML prep including optional diagram prerender. */
export async function prepareHtmlForPdfAsync(
  html: string,
  opts?: PrepareHtmlForPdfOptions,
): Promise<string> {
  let out = stripClientScripts(html);
  const prerender = opts?.prerenderDiagrams !== false;
  if (prerender && opts?.distDir !== undefined) {
    const config = opts.diagrams ?? DEFAULT_DIAGRAMS_CONFIG;
    out = await prerenderDiagramBlocks(out, opts.distDir, config);
  }
  return injectPrintStylesheet(out);
}