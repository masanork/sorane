import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SoraneAstroBackendArtifact, SoraneAstroBackendOutput } from "./contract.ts";

export function decodeBackendArtifact(artifact: SoraneAstroBackendArtifact): Buffer | string {
  if (artifact.kind === "text") return artifact.content;
  return Buffer.from(artifact.content, "base64");
}

/** Write backend artifacts to the Astro output directory. */
export function writeSoraneAstroBackendArtifacts(
  outDir: string,
  output: SoraneAstroBackendOutput,
): readonly string[] {
  const files: string[] = [];
  for (const artifact of output.artifacts) {
    const target = join(outDir, artifact.path);
    mkdirSync(dirname(target), { recursive: true });
    const payload = decodeBackendArtifact(artifact);
    writeFileSync(target, payload);
    files.push(artifact.path);
  }
  return files;
}