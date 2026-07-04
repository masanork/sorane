import { mergeConfig, validateSiteContent } from "@sorane/core";
import type { ParsedConcept } from "@sorane/okf";
import type { SoraneAstroBackendInput } from "./contract.ts";
import type { SoraneAstroValidateMode } from "./options.ts";

function astroSoraneConfig(input: SoraneAstroBackendInput) {
  const contentRel = input.contentDir.startsWith(input.root)
    ? input.contentDir.slice(input.root.length).replace(/^[/\\]+/, "")
    : input.contentDir;
  return mergeConfig({
    site: {
      title: input.site.title,
      description: input.site.description,
      base_url: input.site.baseUrl ?? "",
    },
    build: {
      content_dir: contentRel,
      ...(input.quality ? { quality: input.quality } : {}),
    },
    ...(input.okf ? { okf: input.okf } : {}),
  } as Parameters<typeof mergeConfig>[0]);
}

function collectMdxValidation(parsed: ParsedConcept[]): {
  errors: number;
  warnings: number;
  details: string[];
} {
  const details: string[] = [];
  let errors = 0;
  let warnings = 0;
  for (const p of parsed) {
    if (!/\.mdx$/i.test(p.relPath)) continue;
    for (const issue of p.validation.issues) {
      details.push(`${p.relPath}: ${issue.message}`);
      errors++;
    }
    for (const warning of p.validation.warnings) {
      details.push(`${p.relPath}: ${warning}`);
      warnings++;
    }
  }
  return { errors, warnings, details };
}

export function collectBackendValidation(
  input: SoraneAstroBackendInput,
  allParsed: ParsedConcept[],
  mode: SoraneAstroValidateMode,
): { errors: number; warnings: number; details: string[] } {
  if (mode === false) {
    return { errors: 0, warnings: 0, details: [] };
  }
  const report = validateSiteContent(input.root, astroSoraneConfig(input));
  const mdx = collectMdxValidation(allParsed);
  const details = [
    ...report.files.flatMap((f) =>
      f.findings.map((finding) => `${f.file}: ${finding.message}`),
    ),
    ...mdx.details,
  ];
  return {
    errors: report.error_count + mdx.errors,
    warnings: report.warning_count + mdx.warnings,
    details,
  };
}