import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDisclosureFields } from "./digital-source-type.ts";
import { extract } from "./extract.ts";
import { normalizeConcept } from "./normalize.ts";
import {
  DEFAULT_PROFILE,
  isProfile03,
  resolveProfileForValidation,
  SUPPORTED_PROFILE_RE,
  TYPES_01_02,
  TYPES_03,
} from "./profile.ts";
import { parseYaml } from "./yaml.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_SCHEMA_DIR = join(__dirname, "../profile");

export interface ValidationIssue {
  readonly where: "structure" | "frontmatter" | "type" | "profile";
  readonly message: string;
  readonly instancePath?: string;
}

export interface ValidationResult {
  readonly file: string;
  readonly ok: boolean;
  readonly type?: string;
  readonly issues: readonly ValidationIssue[];
  readonly warnings: readonly string[];
}

const validatorCache = new Map<string, ReturnType<Ajv["compile"]>>();

export function validateProfileFormat(
  profile: string | undefined,
): ValidationIssue | null {
  if (profile === undefined) return null;
  if (!SUPPORTED_PROFILE_RE.test(profile)) {
    return {
      where: "profile",
      message: `Unsupported profile "${profile}"; supported: sorane-okf/0.1, sorane-okf/0.2, sorane-okf/0.3`,
    };
  }
  return null;
}

export function resolveProfileSchema(profile: string): string {
  const m = profile.match(SUPPORTED_PROFILE_RE);
  if (!m) {
    throw new Error(`unsupported profile: ${profile}`);
  }
  return join(PROFILE_SCHEMA_DIR, `sorane-okf-${m[1]}.schema.json`);
}

function getValidatorForProfile(profile: string): ReturnType<Ajv["compile"]> {
  const path = resolveProfileSchema(profile);
  let v = validatorCache.get(path);
  if (!v) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    v = ajv.compile(JSON.parse(readFileSync(path, "utf8")));
    validatorCache.set(path, v);
  }
  return v;
}

function slugFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return base.replace(/\.md$/i, "");
}

function validateTypeForProfile(
  type: string,
  profile: string,
  issues: ValidationIssue[],
  warnings: string[],
): void {
  if (!type) {
    issues.push({
      where: "type",
      message: "OKF 必須フィールド `type` がありません",
    });
    return;
  }

  if (isProfile03(profile)) {
    if (!TYPES_03.has(type)) {
      warnings.push(
        `unknown type "${type}" (sorane-okf/0.3); build treats as article`,
      );
    }
    return;
  }

  if (!TYPES_01_02.has(type)) {
    issues.push({
      where: "type",
      message: `未サポートの type: ${type}（${profile} は article / index のみ）`,
    });
  }
}

/** 1 つの markdown ソースを sorane-okf プロファイルで検証する。 */
export function validateSource(file: string, source: string): ValidationResult {
  const { frontmatter, body } = extract(source);
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];

  if (frontmatter === null) {
    return {
      file,
      ok: false,
      issues: [
        {
          where: "structure",
          message: "frontmatter ブロック（--- で囲む）がありません",
        },
      ],
      warnings,
    };
  }

  let raw: Record<string, unknown>;
  try {
    const parsed = parseYaml(frontmatter);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        file,
        ok: false,
        issues: [{ where: "frontmatter", message: "frontmatter が YAML マッピングではありません" }],
        warnings,
      };
    }
    raw = parsed as Record<string, unknown>;
  } catch (e) {
    return {
      file,
      ok: false,
      issues: [
        {
          where: "frontmatter",
          message: `frontmatter の YAML 解析に失敗: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      warnings,
    };
  }

  const profileIssue = validateProfileFormat(
    typeof raw.profile === "string" ? raw.profile : undefined,
  );
  if (profileIssue) {
    issues.push(profileIssue);
  }

  const concept = normalizeConcept(raw, body, slugFromPath(file));
  warnings.push(...concept.warnings);

  const profile = resolveProfileForValidation(
    typeof concept.profile === "string" && SUPPORTED_PROFILE_RE.test(concept.profile)
      ? concept.profile
      : undefined,
  );

  validateTypeForProfile(concept.type, profile, issues, warnings);

  if (issues.every((i) => i.where !== "profile")) {
    const validate = getValidatorForProfile(profile);
    const schemaType =
      isProfile03(profile) && concept.type && !TYPES_03.has(concept.type)
        ? "article"
        : concept.type || "article";
    const fmForSchema: Record<string, unknown> = {
      title: concept.title,
      ...concept.frontmatter,
      type: schemaType,
    };
    if (concept.timestamp) fmForSchema.timestamp = concept.timestamp;
    if (concept.description) fmForSchema.description = concept.description;
    if (concept.tags) fmForSchema.tags = [...concept.tags];
    if (concept.resource) fmForSchema.resource = concept.resource;
    if (concept.profile) fmForSchema.profile = concept.profile;

    if (!validate(fmForSchema)) {
      for (const err of validate.errors ?? []) {
        issues.push({
          where: "frontmatter",
          instancePath: err.instancePath || "/",
          message: err.message ?? "invalid",
        });
      }
    }
  }

  const strictDisclosure = profile === "sorane-okf/0.2" || profile === "sorane-okf/0.3";
  const disclosure = validateDisclosureFields(concept.frontmatter, strictDisclosure);
  warnings.push(...disclosure.warnings);
  for (const d of disclosure.issues) {
    issues.push({
      where: "frontmatter",
      instancePath: `/${d.path}`,
      message: d.message,
    });
  }

  return {
    file,
    ok: issues.length === 0,
    type: concept.type || undefined,
    issues,
    warnings,
  };
}