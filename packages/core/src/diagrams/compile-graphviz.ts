import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DiagramsConfig } from "../config.ts";
import { diagramSourceHash } from "./diagram-hash.ts";

const execFileAsync = promisify(execFile);

export function isGraphvizCompileEnabled(config?: DiagramsConfig): boolean {
  return config?.enabled !== false && config?.graphviz?.enabled === true;
}

export function resolveGraphvizBinary(config: DiagramsConfig): string {
  return config.graphviz?.binary ?? "dot";
}

export function isGraphvizLang(lang: string | null | undefined): boolean {
  return lang === "graphviz" || lang === "dot";
}

export interface CompileGraphvizOptions {
  readonly source: string;
  readonly binary: string;
  readonly outDir: string;
}

export interface CompileGraphvizResult {
  readonly hash: string;
  readonly svgFileName: string;
  readonly ok: boolean;
  readonly warning?: string;
}

export async function compileGraphvizToSvg(
  opts: CompileGraphvizOptions,
): Promise<CompileGraphvizResult> {
  const hash = diagramSourceHash(opts.source);
  const svgFileName = `${hash}.svg`;
  const dest = join(opts.outDir, svgFileName);
  mkdirSync(opts.outDir, { recursive: true });

  if (existsSync(dest)) {
    return { hash, svgFileName, ok: true };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "sorane-dot-"));
  try {
    const input = join(tmpDir, "diagram.dot");
    const output = join(tmpDir, "diagram.svg");
    writeFileSync(input, opts.source, "utf8");
    await execFileAsync(opts.binary, ["-Tsvg", input, "-o", output], {
      timeout: 120_000,
    });
    writeFileSync(dest, readFileSync(output), "utf8");
    return { hash, svgFileName, ok: true };
  } catch (err) {
    const warning = err instanceof Error ? err.message : String(err);
    return { hash, svgFileName, ok: false, warning };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}