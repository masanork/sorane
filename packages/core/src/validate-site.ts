import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { extract, parseConcept, parseYaml, validateSource, type ValidationIssue } from "@sorane/okf";
import type { SoraneConfig } from "./config.ts";
import { buildGlossaryLinkIndex } from "./markup/glossary-link-index.ts";
import { validateTermLinkWarnings } from "./markup/validate-term-links.ts";
import { resolveI18nContext } from "./i18n.ts";
import { validateDiagramAltWarnings } from "./diagrams/validate-diagram-alt.ts";
import { validateFaqWarnings } from "./faq-page.ts";
import { validateGlossaryWarnings } from "./glossary-page.ts";
import { validateGlossaryTermWarnings } from "./glossary-term-page.ts";
import { discoverDirectoryIndexes } from "./directory-index.ts";
import { validateDatasetWarnings } from "./dataset-page.ts";
import { validateEuThemeWarnings } from "./open-data.ts";
import { validateReferenceWarnings } from "./reference-page.ts";
import { validateHeadingWarnings } from "./validate-heading-structure.ts";
import { validateLangMixingWarnings } from "./validate-lang-mixing.ts";
import { validateContentQualityFindings } from "./validate-content-quality.ts";
import { validateRevisionFindings } from "./revision-history.ts";
import { validateI18nWarnings } from "./validate-i18n.ts";
import { okfValidateOptions } from "./okf-config.ts";
import {
  redirectValidationOptions,
  validateRedirectCollisions,
  validateRedirectConfigRules,
  validateRedirectFrontmatter,
} from "./redirects.ts";
import { validateConfigSecurity } from "./validate-config-security.ts";
import {
  linkSchemeGateEnabled,
  linkSchemeGateSeverity,
  validateUnsafeLinkFindings,
} from "./validate-unsafe-links.ts";

export const VALIDATE_JSON_SCHEMA_VERSION = 1 as const;

export type ValidateFindingSeverity = "error" | "warning";
export type ValidateFindingCategory =
  | "okf"
  | "diagram"
  | "heading"
  | "image"
  | "link"
  | "table"
  | "date"
  | "revision"
  | "faq"
  | "glossary"
  | "reference"
  | "dataset"
  | "i18n"
  | "lang"
  | "redirect";

export interface ValidateFinding {
  readonly severity: ValidateFindingSeverity;
  readonly category: ValidateFindingCategory;
  readonly message: string;
  readonly where?: ValidationIssue["where"];
  readonly instancePath?: string;
}

export interface ValidateFileReport {
  readonly file: string;
  readonly ok: boolean;
  readonly type?: string;
  readonly profile?: string;
  readonly findings: readonly ValidateFinding[];
}

export interface ValidateSiteReport {
  readonly schema_version: typeof VALIDATE_JSON_SCHEMA_VERSION;
  readonly ok: boolean;
  readonly error_count: number;
  readonly warning_count: number;
  readonly files: readonly ValidateFileReport[];
}

function walkMarkdown(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (name.endsWith(".md")) out.push(abs);
    }
  }
  visit(root);
  return out;
}

function okfIssueToFinding(issue: ValidationIssue): ValidateFinding {
  return {
    severity: "error",
    category: "okf",
    message: issue.message,
    where: issue.where,
    instancePath: issue.instancePath,
  };
}

function warningToFinding(category: ValidateFindingCategory, message: string): ValidateFinding {
  return { severity: "warning", category, message };
}

function findingWithSeverity(
  severity: ValidateFindingSeverity,
  category: ValidateFindingCategory,
  message: string,
): ValidateFinding {
  return { severity, category, message };
}

function headingGateEnabled(quality: SoraneConfig["build"]["quality"]): boolean {
  const mode = quality?.heading;
  return mode !== false;
}

function headingSeverity(quality: SoraneConfig["build"]["quality"]): ValidateFindingSeverity {
  return quality?.heading === "error" ? "error" : "warning";
}

function frontmatterRecord(source: string): Record<string, unknown> {
  const { frontmatter } = extract(source);
  if (frontmatter === null || frontmatter.length === 0) return {};
  const parsed = parseYaml(frontmatter);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function profileFromSource(source: string): string | undefined {
  const profile = frontmatterRecord(source).profile;
  return typeof profile === "string" ? profile : undefined;
}

/** `content/` 配下の Markdown を検証し、エージェント向けレポートを返す。 */
export function validateSiteContent(
  cwd: string,
  config: SoraneConfig,
): ValidateSiteReport {
  const contentDir = resolve(cwd, config.build.content_dir);
  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  const okfOpts = okfValidateOptions(config);
  const files: ValidateFileReport[] = [];
  const i18nEntries: Array<{ rel: string; source: string }> = [];
  let errorCount = 0;
  let warningCount = 0;
  const i18n = resolveI18nContext(config.site);
  const redirectOpts = redirectValidationOptions(config);
  const linkSchemeEnabled = linkSchemeGateEnabled(config);
  const linkSchemeSeverity = linkSchemeGateSeverity(config);

  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    i18nEntries.push({ rel, source });
  }

  const glossaryLinkIndex = buildGlossaryLinkIndex(
    i18nEntries.map((e) => parseConcept("", e.rel, e.source, okfOpts)),
    config,
    i18n,
  );

  for (const { rel, source } of i18nEntries) {
    const result = validateSource(rel, source, okfOpts);
    const findings: ValidateFinding[] = [];

    for (const w of result.warnings) {
      findings.push(warningToFinding("okf", w));
      warningCount++;
    }

    const { frontmatter, body } = extract(source);
    if (body !== null) {
      for (const w of validateDiagramAltWarnings(body, config.build.diagrams ?? {})) {
        findings.push(warningToFinding("diagram", w));
        warningCount++;
      }
      const fm = frontmatterRecord(source);
      if (headingGateEnabled(config.build.quality)) {
        const hSeverity = headingSeverity(config.build.quality);
        for (const w of validateHeadingWarnings(body)) {
          findings.push(findingWithSeverity(hSeverity, "heading", w));
          if (hSeverity === "error") errorCount++;
          else warningCount++;
        }
      }
      const pageLang =
        typeof fm.lang === "string" && fm.lang.length > 0
          ? fm.lang
          : config.site.lang;
      for (const w of validateLangMixingWarnings(body, pageLang, config.build.quality)) {
        findings.push(warningToFinding("lang", w));
        warningCount++;
      }
      for (const w of validateTermLinkWarnings(body, glossaryLinkIndex)) {
        findings.push(warningToFinding("glossary", w));
        warningCount++;
      }
      if (result.type === "faq") {
        for (const w of validateFaqWarnings(body)) {
          findings.push(warningToFinding("faq", w));
          warningCount++;
        }
      }
      if (result.type === "glossary") {
        for (const w of validateGlossaryWarnings(body, fm)) {
          findings.push(warningToFinding("glossary", w));
          warningCount++;
        }
      }
      if (result.type === "glossary-term") {
        for (const w of validateGlossaryTermWarnings(body, fm)) {
          findings.push(warningToFinding("glossary", w));
          warningCount++;
        }
      }
      if (result.type === "reference") {
        for (const w of validateReferenceWarnings(body, {
          description: typeof fm.description === "string" ? fm.description : undefined,
          resource: typeof fm.resource === "string" ? fm.resource : undefined,
          frontmatter: fm,
        })) {
          findings.push(warningToFinding("reference", w));
          warningCount++;
        }
      }
      if (result.type === "dataset") {
        for (const w of validateDatasetWarnings(fm)) {
          findings.push(warningToFinding("dataset", w));
          warningCount++;
        }
      }
      if (typeof fm.theme === "string" && fm.theme.length > 0 && result.type !== "dataset") {
        for (const w of validateEuThemeWarnings(fm.theme, result.type ?? "page")) {
          findings.push(warningToFinding("dataset", w));
          warningCount++;
        }
      }
      for (const f of validateContentQualityFindings(body, fm, config.build.quality)) {
        findings.push(warningToFinding(f.category, f.message));
        warningCount++;
      }
      if (linkSchemeEnabled) {
        for (const f of validateUnsafeLinkFindings(body, config)) {
          const linkSeverity: ValidateFindingSeverity =
            linkSchemeSeverity === "error" ? "error" : "warning";
          findings.push(findingWithSeverity(linkSeverity, "link", f.message));
          if (linkSeverity === "error") errorCount++;
          else warningCount++;
        }
      }
      for (const f of validateRevisionFindings(fm)) {
        findings.push(warningToFinding(f.category, f.message));
        warningCount++;
      }
      for (const f of validateRedirectFrontmatter(fm, redirectOpts)) {
        findings.push(findingWithSeverity(f.severity, "redirect", f.message));
        if (f.severity === "error") errorCount++;
        else warningCount++;
      }
    }

    if (!result.ok) {
      for (const issue of result.issues) {
        findings.push(okfIssueToFinding(issue));
        errorCount++;
      }
    }

    const hasErrorFinding = findings.some((f) => f.severity === "error");
    files.push({
      file: rel,
      ok: result.ok && !hasErrorFinding,
      type: result.type,
      profile: profileFromSource(source),
      findings,
    });
  }

  const parsedConcepts = i18nEntries.map((e) =>
    parseConcept("", e.rel, e.source, okfOpts),
  );
  for (const spec of discoverDirectoryIndexes(parsedConcepts, config, i18n)) {
    files.push({
      file: `${spec.dirRel}/`,
      ok: true,
      findings: [
        warningToFinding(
          "okf",
          `okf: directory ${spec.dirRel}/ has no index.md; build auto-generates OKF listing`,
        ),
      ],
    });
    warningCount++;
  }

  const configSecurityFindings = validateConfigSecurity(config);
  if (configSecurityFindings.length > 0) {
    const findings: ValidateFinding[] = [];
    for (const f of configSecurityFindings) {
      findings.push(f);
      if (f.severity === "error") errorCount++;
      else warningCount++;
    }
    files.push({
      file: "sorane.yaml",
      ok: !findings.some((x) => x.severity === "error"),
      findings,
    });
  }

  const redirectConfigFindings = [
    ...validateRedirectConfigRules(config.build.redirects, redirectOpts),
    ...validateRedirectCollisions(parsedConcepts, config, i18n),
  ];
  if (redirectConfigFindings.length > 0) {
    const findings: ValidateFinding[] = [];
    for (const f of redirectConfigFindings) {
      findings.push(findingWithSeverity(f.severity, "redirect", f.message));
      if (f.severity === "error") errorCount++;
      else warningCount++;
    }
    files.push({
      file: "sorane.yaml",
      ok: !findings.some((x) => x.severity === "error"),
      findings,
    });
  }

  const i18nWarnings = validateI18nWarnings(i18nEntries, config.site);
  if (i18nWarnings.size > 0) {
    for (const file of files) {
      const extra = i18nWarnings.get(file.file);
      if (!extra || extra.length === 0) continue;
      const merged = [...file.findings];
      for (const w of extra) {
        merged.push(warningToFinding("i18n", w.message));
        warningCount++;
      }
      const idx = files.indexOf(file);
      files[idx] = { ...file, findings: merged };
    }
  }

  return {
    schema_version: VALIDATE_JSON_SCHEMA_VERSION,
    ok: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
    files,
  };
}