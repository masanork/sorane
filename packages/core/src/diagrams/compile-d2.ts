import { createHash } from "node:crypto";
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

const execFileAsync = promisify(execFile);

export function d2SourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function isD2CompileEnabled(config?: DiagramsConfig): boolean {
  return config?.enabled !== false && config?.d2?.enabled === true;
}

export function resolveD2Binary(config: DiagramsConfig): string {
  return config.d2?.binary ?? "d2";
}

export interface CompileD2Options {
  readonly source: string;
  readonly binary: string;
  readonly outDir: string;
}

export interface CompileD2Result {
  readonly hash: string;
  readonly svgFileName: string;
  readonly ok: boolean;
  readonly warning?: string;
}

export async function compileD2ToSvg(opts: CompileD2Options): Promise<CompileD2Result> {
  const hash = d2SourceHash(opts.source);
  const svgFileName = `${hash}.svg`;
  const dest = join(opts.outDir, svgFileName);
  mkdirSync(opts.outDir, { recursive: true });

  if (existsSync(dest)) {
    return { hash, svgFileName, ok: true };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "sorane-d2-"));
  try {
    const input = join(tmpDir, "diagram.d2");
    const output = join(tmpDir, "diagram.svg");
    writeFileSync(input, opts.source, "utf8");
    await execFileAsync(opts.binary, ["--layout", "elk", input, output], {
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