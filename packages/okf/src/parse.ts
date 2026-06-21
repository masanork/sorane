import { extract } from "./extract.ts";
import { normalizeConcept, type OkfConcept } from "./normalize.ts";
import { parseYaml } from "./yaml.ts";
import { resolveProfileForValidation, SUPPORTED_PROFILE_RE } from "./profile.ts";
import { validateSource, type ValidateOptions, type ValidationResult } from "./validate.ts";

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
export function parseConcept(
  file: string,
  relPath: string,
  source: string,
  options?: ValidateOptions,
): ParsedConcept {
  const validation = validateSource(relPath, source, options);
  const { frontmatter, body } = extract(source);
  const raw =
    frontmatter !== null
      ? ((parseYaml(frontmatter) as Record<string, unknown>) ?? {})
      : {};
  let concept = normalizeConcept(raw, body, slugFromPath(relPath));
  const explicitProfile =
    typeof concept.profile === "string" && SUPPORTED_PROFILE_RE.test(concept.profile)
      ? concept.profile
      : undefined;
  if (!explicitProfile) {
    const profile = resolveProfileForValidation(undefined, options?.defaultProfile);
    concept = { ...concept, profile };
  }
  return { concept, file, relPath, validation };
}