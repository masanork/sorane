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
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import type { DiagramsConfig } from "../config.ts";
import { diagramSourceHash } from "./diagram-hash.ts";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export function isMermaidBuildEnabled(config?: DiagramsConfig): boolean {
  return config?.enabled !== false && config?.mermaid?.mode === "build";
}

export function resolveMmdcBinary(config: DiagramsConfig): string {
  const configured = config.mermaid?.mmdc;
  if (configured && configured.length > 0 && configured !== "mmdc") return configured;
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "mmdc"),
    (() => {
      try {
        const pkgPath = require.resolve("@mermaid-js/mermaid-cli/package.json");
        return join(dirname(pkgPath), "node_modules", ".bin", "mmdc");
      } catch {
        return "";
      }
    })(),
    (() => {
      try {
        return require.resolve("@mermaid-js/mermaid-cli/src/cli.js");
      } catch {
        return "";
      }
    })(),
  ];
  for (const candidate of candidates) {
    if (candidate.length > 0 && existsSync(candidate)) return candidate;
  }
  return configured && configured.length > 0 ? configured : "mmdc";
}

export interface CompileMermaidOptions {
  readonly source: string;
  readonly binary: string;
  readonly outDir: string;
}

export interface CompileMermaidResult {
  readonly hash: string;
  readonly svgFileName: string;
  readonly ok: boolean;
  readonly warning?: string;
}

const MERMAID_CONFIG = {
  securityLevel: "strict",
  deterministicIds: true,
  deterministicIDSeed: "sorane",
};

export async function compileMermaidToSvg(
  opts: CompileMermaidOptions,
): Promise<CompileMermaidResult> {
  const hash = diagramSourceHash(opts.source);
  const svgFileName = `${hash}.svg`;
  const dest = join(opts.outDir, svgFileName);
  mkdirSync(opts.outDir, { recursive: true });

  if (existsSync(dest)) {
    return { hash, svgFileName, ok: true };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "sorane-mmdc-"));
  try {
    const input = join(tmpDir, "diagram.mmd");
    const output = join(tmpDir, "diagram.svg");
    const configPath = join(tmpDir, "mermaidConfig.json");
    writeFileSync(input, opts.source, "utf8");
    writeFileSync(configPath, JSON.stringify(MERMAID_CONFIG), "utf8");
    await execFileAsync(
      opts.binary,
      ["-i", input, "-o", output, "-c", configPath, "--quiet"],
      { timeout: 180_000 },
    );
    writeFileSync(dest, readFileSync(output), "utf8");
    return { hash, svgFileName, ok: true };
  } catch (err) {
    const warning = err instanceof Error ? err.message : String(err);
    return { hash, svgFileName, ok: false, warning };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}