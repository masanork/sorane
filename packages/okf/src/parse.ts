import { extract } from "./extract.ts";
import { normalizeConcept, type OkfConcept } from "./normalize.ts";
import { parseYaml } from "./yaml.ts";
import { validateSource, type ValidationResult } from "./validate.ts";

export interface ParsedConcept {
  readonly concept: OkfConcept;
  readonly file: string;
  readonly relPath: string;
  readonly validation: ValidationResult;
}

function slugFromPath(relPath: string): string {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "");
}

/** markdown ソースを parse + normalize する（検証結果も返す）。 */
export function parseConcept(file: string, relPath: string, source: string): ParsedConcept {
  const validation = validateSource(relPath, source);
  const { frontmatter, body } = extract(source);
  const raw =
    frontmatter !== null
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};
  const concept = normalizeConcept(raw, body, slugFromPath(relPath));
  return { concept, file, relPath, validation };
}