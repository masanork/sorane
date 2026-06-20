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

/** 旧 frontmatter を OKF native markdown に変換する。 */
export function migrateToOkf(source: string, filePath: string): string {
  const { frontmatter, body } = extract(source);
  const raw =
    frontmatter !== null
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};
  const concept = normalizeConcept(raw, body, slugFromPath(filePath));

  const migrated: typeof concept = {
    ...concept,
    type: concept.type || "article",
    profile: concept.profile ?? "sorane-okf/0.1",
    frontmatter: Object.fromEntries(
      Object.entries(concept.frontmatter).filter(
        ([k]) => !["layout", "kind", "date", "publishedAt"].includes(k),
      ),
    ),
  };

  return conceptToOkfMarkdown(migrated);
}