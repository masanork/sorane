/**
 * OKF concept markdown から frontmatter を抽出する。
 * gray-matter は使わない（CORE_SCHEMA との整合のため parse は yaml.ts に委ねる）。
 */

export interface ExtractResult {
  readonly frontmatter: string | null;
  readonly body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function extract(source: string): ExtractResult {
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: source };
  }
  return {
    frontmatter: match[1] ?? "",
    body: source.slice(match[0].length),
  };
}

export function stripFrontmatter(source: string): string {
  return extract(source).body;
}