import type { DiagramsConfig } from "../config.ts";
import { isGraphvizLang } from "./compile-graphviz.ts";
import { extractAltText } from "./parse-diagram-fence.ts";

const FENCE_OPEN_RE = /^(`{3,}|~{3,})(\S*)\s*(.*)$/;

function isDiagramLangActive(lang: string, config: DiagramsConfig): boolean {
  if (config.enabled === false) return false;
  if (lang === "mermaid") return config.mermaid?.mode !== "off";
  if (lang === "d2") return config.d2?.enabled === true;
  if (isGraphvizLang(lang)) return config.graphviz?.enabled === true;
  return false;
}

/** Markdown 本文の図表フェンスで alt 欠落を検出する（warning のみ、ビルドは継続）。 */
export function validateDiagramAltWarnings(
  body: string,
  config: DiagramsConfig,
): readonly string[] {
  const warnings: string[] = [];
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN_RE.exec(lines[i]!);
    if (open === null) {
      i++;
      continue;
    }
    const marker = open[1]!;
    const lang = open[2] ?? "";
    const meta = open[3] ?? "";
    const close = marker[0]!;
    const minLen = marker.length;
    const block: string[] = [];
    i++;
    while (i < lines.length) {
      const line = lines[i]!;
      if (
        line.length >= minLen &&
        line.startsWith(close.repeat(minLen)) &&
        (line.length === minLen || /^\s*$/.test(line.slice(minLen)))
      ) {
        break;
      }
      block.push(line);
      i++;
    }
    i++;
    if (!isDiagramLangActive(lang, config)) continue;
    if (extractAltText(meta, block.join("\n"))) continue;
    warnings.push(
      `diagram (${lang}) has no alt text; add alt="..." to the fence info string or a %% alt: comment`,
    );
  }
  return warnings;
}