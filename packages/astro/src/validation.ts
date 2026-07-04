import { mergeConfig, validateSiteContent } from "@sorane/core";
import type { SoraneAstroBackendInput } from "./contract.ts";
import type { SoraneAstroValidateMode } from "./options.ts";

function astroSoraneConfig(input: SoraneAstroBackendInput) {
  const contentRel = input.contentDir.startsWith(input.root)
    ? input.contentDir.slice(input.root.length).replace(/^[/\\]+/, "")
    : input.contentDir;
  const i18nLocales = input.site.i18n?.locales;
  const emergencyLocales = input.site.emergency?.locales;
  return mergeConfig({
    site: {
      title: input.site.title,
      description: input.site.description,
      base_url: input.site.baseUrl ?? "",
      ...(input.site.lang ? { lang: input.site.lang } : {}),
      ...(input.site.i18n
        ? {
            i18n: {
              ...(input.site.i18n.default ? { default: input.site.i18n.default } : {}),
              ...(i18nLocales
                ? {
                    locales: Object.fromEntries(
                      Object.entries(i18nLocales).map(([id, spec]) => [
                        id,
                        { lang: spec.lang, path_prefix: spec.pathPrefix },
                      ]),
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(input.site.emergency
        ? {
            emergency: {
              ...(input.site.emergency.message
                ? { message: input.site.emergency.message }
                : {}),
              ...(input.site.emergency.href ? { href: input.site.emergency.href } : {}),
              ...(emergencyLocales
                ? {
                    locales: Object.fromEntries(
                      Object.entries(emergencyLocales).map(([id, spec]) => [
                        id,
                        {
                          ...(spec.message ? { message: spec.message } : {}),
                          ...(spec.href ? { href: spec.href } : {}),
                        },
                      ]),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    },
    build: {
      content_dir: contentRel,
      ...(input.quality ? { quality: input.quality } : {}),
      ...(input.diagrams ? { diagrams: input.diagrams } : {}),
      ...(input.redirects ? { redirects: input.redirects } : {}),
      ...(input.imageMetadata ? { image_metadata: input.imageMetadata } : {}),
      ...(input.c2pa ? { c2pa: input.c2pa } : {}),
      ...(input.security
        ? {
            security: {
              ...(input.security.redirectSameOrigin !== undefined
                ? { redirect_same_origin: input.security.redirectSameOrigin }
                : {}),
              ...(input.security.allowCustomBinaries !== undefined
                ? { allow_custom_binaries: input.security.allowCustomBinaries }
                : {}),
            },
          }
        : {}),
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