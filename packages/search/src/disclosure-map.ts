import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDigitalSourceType } from "@sorane/okf";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatterScalar(block: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = block.match(re);
  if (!m) return undefined;
  const raw = m[1]!.trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw.length > 0 ? raw : undefined;
}

/** contentDir 内のソースパスから IPTC URI の disclosure マップを構築する。 */
export function buildSourceDisclosureMap(
  contentDir: string,
  sources: readonly string[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source)) continue;
    seen.add(source);
    const abs = join(contentDir, source);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    const fm = FRONTMATTER_RE.exec(text);
    if (!fm) continue;
    const dst = parseFrontmatterScalar(fm[1]!, "digitalSourceType");
    if (!dst) continue;
    const resolved = resolveDigitalSourceType(dst);
    if (resolved) map.set(source, resolved.uri);
  }
  return map;
}