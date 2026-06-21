import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compileMermaidToSvg,
  resolveMmdcBinary,
} from "../packages/core/src/diagrams/compile-mermaid.ts";
import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

let cached: boolean | undefined;

/** True only when mmdc exists and can render a minimal diagram (needs Chromium in CI). */
export async function mmdcCompileWorks(): Promise<boolean> {
  if (cached !== undefined) return cached;
  const binary = resolveMmdcBinary(DEFAULT_DIAGRAMS_CONFIG);
  try {
    execFileSync(binary, ["--version"], { stdio: "ignore" });
  } catch {
    cached = false;
    return false;
  }
  const tmp = mkdtempSync(join(tmpdir(), "sorane-mmdc-probe-"));
  try {
    const result = await compileMermaidToSvg({
      source: "flowchart LR\n  A --> B",
      binary,
      outDir: tmp,
    });
    cached = result.ok;
    return result.ok;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}