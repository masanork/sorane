import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { extract, parseYaml, validateSource, type ValidationIssue } from "@sorane/okf";
import type { SoraneConfig } from "./config.ts";
import { validateDiagramAltWarnings } from "./diagrams/validate-diagram-alt.ts";
import { validateFaqWarnings } from "./faq-page.ts";
import { validateGlossaryWarnings } from "./glossary-page.ts";
import { validateHeadingWarnings } from "./validate-heading-structure.ts";
import { validateContentQualityFindings } from "./validate-content-quality.ts";
import { validateRevisionFindings } from "./revision-history.ts";

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
  | "glossary";

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

  const files: ValidateFileReport[] = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    const result = validateSource(rel, source);
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
      for (const w of validateHeadingWarnings(body)) {
        findings.push(warningToFinding("heading", w));
        warningCount++;
      }
      const fm = frontmatterRecord(source);
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
      for (const f of validateContentQualityFindings(body, fm, config.build.quality)) {
        findings.push(warningToFinding(f.category, f.message));
        warningCount++;
      }
      for (const f of validateRevisionFindings(fm)) {
        findings.push(warningToFinding(f.category, f.message));
        warningCount++;
      }
    }

    if (!result.ok) {
      for (const issue of result.issues) {
        findings.push(okfIssueToFinding(issue));
        errorCount++;
      }
    }

    files.push({
      file: rel,
      ok: result.ok,
      type: result.type,
      profile: profileFromSource(source),
      findings,
    });
  }

  return {
    schema_version: VALIDATE_JSON_SCHEMA_VERSION,
    ok: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
    files,
  };
}