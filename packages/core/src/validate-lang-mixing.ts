import type { QualityGateConfig } from "./config.ts";

const FENCE_OPEN_RE = /^(```+|~~~+)/;
const HTML_TAG_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const LANG_ATTR_RE = /\blang\s*=\s*["']([^"']+)["']/i;

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_WORD_RE = /[A-Za-z]{4,}/;

function gateEnabled(config: QualityGateConfig | undefined): boolean {
  if (!config) return true;
  return config.lang_mixing !== false;
}

function isValidBcp47(tag: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag);
}

function forEachBodyLine(
  body: string,
  fn: (line: string, lineNo: number) => void,
): void {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;
    fn(line, i + 1);
  }
}

/** 本文の言語混在・`lang` 属性を検査する（warning のみ）。 */
export function validateLangMixingWarnings(
  body: string,
  pageLang: string,
  config?: QualityGateConfig,
): readonly string[] {
  if (!gateEnabled(config)) return [];
  const warnings: string[] = [];
  const primaryJa = pageLang.startsWith("ja");

  forEachBodyLine(body, (line, lineNo) => {
    for (const m of line.matchAll(HTML_TAG_RE)) {
      const attrs = m[2] ?? "";
      const langMatch = LANG_ATTR_RE.exec(attrs);
      if (langMatch) {
        const tag = langMatch[1]!.trim();
        if (!isValidBcp47(tag)) {
          warnings.push(
            `lang: invalid lang="${tag}" on <${m[1]}> (line ${lineNo}); use a BCP 47 tag (e.g. en, en-US)`,
          );
        }
      }
    }

    if (line.includes("lang=") || line.includes("<lang")) return;

    const hasCjk = CJK_RE.test(line);
    const hasLatin = LATIN_WORD_RE.test(line);
    if (!hasCjk || !hasLatin) return;

    if (primaryJa) {
      warnings.push(
        `lang: mixed Japanese and Latin script without lang markup (line ${lineNo}); wrap foreign text in <span lang="en">…</span>`,
      );
    } else if (pageLang.startsWith("en") && hasCjk) {
      warnings.push(
        `lang: mixed English and CJK script without lang markup (line ${lineNo}); wrap non-English text in <span lang="ja">…</span>`,
      );
    }
  });

  return warnings;
}