import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "./extract.ts";
import { normalizeConcept } from "./normalize.ts";
import { parseYaml } from "./yaml.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const SCHEMA_PATH = join(REPO_ROOT, "profile/sorane-okf-0.1.schema.json");

const SUPPORTED_TYPES = new Set(["article", "index"]);

export interface ValidationIssue {
  readonly where: "structure" | "frontmatter" | "type";
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

let compiledValidator: ReturnType<Ajv["compile"]> | null = null;

function getValidator(): ReturnType<Ajv["compile"]> {
  if (compiledValidator) return compiledValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  compiledValidator = ajv.compile(schema);
  return compiledValidator;
}

function slugFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return base.replace(/\.md$/i, "");
}

/** 1 つの markdown ソースを sorane-okf/0.1 で検証する。 */
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

  const concept = normalizeConcept(raw, body, slugFromPath(file));
  warnings.push(...concept.warnings);

  if (!concept.type) {
    issues.push({
      where: "type",
      message: "OKF 必須フィールド `type` がありません",
    });
  } else if (!SUPPORTED_TYPES.has(concept.type)) {
    issues.push({
      where: "type",
      message: `未サポートの type: ${concept.type}（v0.1 は article / index のみ）`,
    });
  }

  const validate = getValidator();
  const fmForSchema: Record<string, unknown> = {
    type: concept.type || "article",
    title: concept.title,
    ...concept.frontmatter,
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

  return {
    file,
    ok: issues.length === 0,
    type: concept.type || undefined,
    issues,
    warnings,
  };
}