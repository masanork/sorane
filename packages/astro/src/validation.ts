import { mergeConfig, validateSiteContent } from "@sorane/core";
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
      ...(input.site.lang ? { lang: input.site.lang } : {}),
    },
    build: {
      content_dir: contentRel,
      ...(input.quality ? { quality: input.quality } : {}),
    },
    ...(input.okf ? { okf: input.okf } : {}),
  } as Parameters<typeof mergeConfig>[0]);
}

/** Site validation for the Astro integration layer (always TypeScript; backends use `validate: false`). */
export function collectBackendValidation(
  input: SoraneAstroBackendInput,
  mode: SoraneAstroValidateMode,
): { errors: number; warnings: number; details: string[] } {
  if (mode === false) {
    return { errors: 0, warnings: 0, details: [] };
  }
  const report = validateSiteContent(input.root, astroSoraneConfig(input));
  const details = report.files.flatMap((f) =>
    f.findings.map((finding) => `${f.file}: ${finding.message}`),
  );
  return {
    errors: report.error_count,
    warnings: report.warning_count,
    details,
  };
}