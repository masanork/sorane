import {
  conceptToOkfMarkdown,
  extract,
  normalizeConcept,
  parseYaml,
} from "@sorane/okf";

function slugFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return base.replace(/\.md$/i, "");
}

const SUPPORTED_BUMP_PROFILES = new Set(["0.1", "0.2", "0.3"]);

function migrateStaleAfter(raw: Record<string, unknown>): Record<string, unknown> {
  const value = raw.stale_after;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return raw;

  const instant = `${value}T00:00:00Z`;
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return raw;
  }
  return { ...raw, stale_after: instant };
}

export interface MigrateToOkfOptions {
  readonly bumpProfile?: string;
}

/** 旧 frontmatter を OKF native markdown に変換する。 */
export function migrateToOkf(
  source: string,
  filePath: string,
  opts?: MigrateToOkfOptions,
): string {
  const { frontmatter, body } = extract(source);
  const raw =
    frontmatter !== null
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};
  const concept = normalizeConcept(migrateStaleAfter(raw), body, slugFromPath(filePath));

  const bumpedProfile =
    opts?.bumpProfile !== undefined
      ? `sorane-okf/${opts.bumpProfile}`
      : undefined;
  const defaultProfile = bumpedProfile ?? concept.profile ?? "sorane-okf/0.1";

  const migrated: typeof concept = {
    ...concept,
    type: concept.type || "article",
    profile: defaultProfile,
    frontmatter: Object.fromEntries(
      Object.entries(concept.frontmatter).filter(
        ([k]) => !["layout", "kind", "date", "publishedAt"].includes(k),
      ),
    ),
  };

  return conceptToOkfMarkdown(migrated);
}

export function parseBumpProfileArg(argv: readonly string[]): string | undefined {
  const i = argv.indexOf("--bump-profile");
  if (i < 0 || i + 1 >= argv.length) return undefined;
  const version = argv[i + 1]!.trim();
  if (!SUPPORTED_BUMP_PROFILES.has(version)) {
    throw new Error(`unsupported --bump-profile version: ${version} (supported: 0.1, 0.2, 0.3)`);
  }
  return version;
}
