import type { QualityGateConfig } from "./config.ts";

const FENCE_OPEN_RE = /^(```+|~~~+)/;

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

const GENERIC_LINK_TEXT = new Set([
  "こちら",
  "こちらをクリック",
  "ここ",
  "リンク",
  "詳細",
  "詳細はこちら",
  "こちらから",
  "here",
  "click here",
  "click",
  "link",
  "read more",
  "more",
  "this",
]);

export type ContentQualityCategory = "image" | "link" | "table" | "date";

export interface ContentQualityFinding {
  readonly category: ContentQualityCategory;
  readonly message: string;
}

function gateEnabled(config: QualityGateConfig | undefined, key: keyof QualityGateConfig): boolean {
  if (!config) return true;
  const v = config[key];
  return v !== false;
}

function isGenericLinkText(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  const codeWrapped = /^`([^`]+)`$/.exec(t);
  if (codeWrapped && codeWrapped[1]!.trim().length > 0) return false;
  if (GENERIC_LINK_TEXT.has(t)) return true;
  const lower = t.toLowerCase();
  return GENERIC_LINK_TEXT.has(lower);
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function isTableRow(line: string): boolean {
  const cells = parseTableCells(line);
  return cells.length >= 2;
}

function isSeparatorRow(line: string): boolean {
  const cells = parseTableCells(line);
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** インラインコード `` `...` `` を空白に置換（例示の `![](path)` を除外） */
function stripInlineCode(line: string): string {
  return line.replace(/`+[^`]*`+/g, (m) => " ".repeat(m.length));
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

export function validateImageAltFindings(
  body: string,
  config?: QualityGateConfig,
): readonly ContentQualityFinding[] {
  if (!gateEnabled(config, "image_alt")) return [];
  const findings: ContentQualityFinding[] = [];
  forEachBodyLine(body, (line, lineNo) => {
    const scan = stripInlineCode(line);
    for (const m of scan.matchAll(IMAGE_RE)) {
      const alt = m[1] ?? "";
      if (alt.trim().length === 0) {
        findings.push({
          category: "image",
          message: `image missing alt text (line ${lineNo}); use ![description](path)`,
        });
      }
    }
  });
  return findings;
}

export function validateLinkTextFindings(
  body: string,
  config?: QualityGateConfig,
): readonly ContentQualityFinding[] {
  if (!gateEnabled(config, "link_text")) return [];
  const findings: ContentQualityFinding[] = [];
  forEachBodyLine(body, (line, lineNo) => {
    for (const m of line.matchAll(LINK_RE)) {
      const full = m[0]!;
      if (full.startsWith("!")) continue;
      const text = m[1] ?? "";
      const href = m[2] ?? "";
      if (href.startsWith("#")) continue;
      if (isGenericLinkText(text)) {
        findings.push({
          category: "link",
          message: `non-descriptive link text "${text.trim()}" (line ${lineNo}); prefer meaningful anchor text`,
        });
      }
    }
  });
  return findings;
}

export function validateTableFindings(
  body: string,
  config?: QualityGateConfig,
): readonly ContentQualityFinding[] {
  if (!gateEnabled(config, "table_headers")) return [];
  const findings: ContentQualityFinding[] = [];
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
    if (!isTableRow(line) || isSeparatorRow(line)) continue;

    const lineNo = i + 1;
    const headerCells = parseTableCells(line);
    const next = lines[i + 1];
    if (!next || !isSeparatorRow(next)) {
      findings.push({
        category: "table",
        message: `table missing header separator row (line ${lineNo}); add | --- | after header`,
      });
      continue;
    }
    for (let c = 0; c < headerCells.length; c++) {
      if (headerCells[c]!.length === 0) {
        findings.push({
          category: "table",
          message: `table header cell ${c + 1} is empty (line ${lineNo})`,
        });
      }
    }
    i++;
    while (i + 1 < lines.length && isTableRow(lines[i + 1]!) && !isSeparatorRow(lines[i + 1]!)) {
      i++;
    }
  }
  return findings;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 10) return undefined;
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

export function validateDateFindings(
  frontmatter: Record<string, unknown>,
  config?: QualityGateConfig,
): readonly ContentQualityFinding[] {
  if (!gateEnabled(config, "dates")) return [];
  const findings: ContentQualityFinding[] = [];
  const ts = frontmatter.timestamp;
  const up = frontmatter.updated;

  if (ts !== undefined && typeof ts === "string" && !normalizeDate(ts)) {
    findings.push({
      category: "date",
      message: `timestamp "${ts}" is not a valid date (use YYYY-MM-DD or ISO 8601)`,
    });
  }
  if (up !== undefined && typeof up === "string" && !normalizeDate(up)) {
    findings.push({
      category: "date",
      message: `updated "${up}" is not a valid date (use YYYY-MM-DD or ISO 8601)`,
    });
  }

  const tsNorm = normalizeDate(ts);
  const upNorm = normalizeDate(up);
  if (tsNorm && upNorm && upNorm < tsNorm) {
    findings.push({
      category: "date",
      message: `updated (${upNorm}) is before timestamp (${tsNorm})`,
    });
  }
  return findings;
}

export function validateContentQualityFindings(
  body: string,
  frontmatter: Record<string, unknown>,
  config?: QualityGateConfig,
): readonly ContentQualityFinding[] {
  return [
    ...validateImageAltFindings(body, config),
    ...validateLinkTextFindings(body, config),
    ...validateTableFindings(body, config),
    ...validateDateFindings(frontmatter, config),
  ];
}