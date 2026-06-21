import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Doc } from "../ast/pandoc-types.ts";

export function resolvePandocBinary(): string {
  return process.env.PANDOC?.trim() || "pandoc";
}

export function pandocCliAvailable(binary = resolvePandocBinary()): boolean {
  try {
    execFileSync(binary, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Pandoc JSON AST を docx に変換する（`pandoc` CLI 必須）。 */
export function pandocJsonToDocx(
  doc: Doc,
  outPath: string,
  binary = resolvePandocBinary(),
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  const jsonPath = `${outPath}.pandoc.json`;
  writeFileSync(jsonPath, JSON.stringify(doc), "utf8");
  try {
    execFileSync(binary, ["-f", "json", "-t", "docx", "-o", outPath, jsonPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    unlinkSync(jsonPath);
  } catch (err) {
    try {
      unlinkSync(jsonPath);
    } catch {
      /* ignore */
    }
    const detail =
      err instanceof Error && "stderr" in err && Buffer.isBuffer((err as NodeJS.ErrnoException & { stderr?: Buffer }).stderr)
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr.toString("utf8").trim()
        : "";
    throw new Error(
      detail.length > 0
        ? `pandoc failed: ${detail}`
        : `pandoc failed (is '${binary}' installed?)`,
    );
  }
}