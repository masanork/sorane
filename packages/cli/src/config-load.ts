import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { mergeConfig, type SoraneConfig } from "@sorane/core";

export function loadSoraneConfig(cwd: string): SoraneConfig {
  const path = resolve(cwd, "sorane.yaml");
  if (!existsSync(path)) {
    return mergeConfig({});
  }
  const raw = yaml.load(readFileSync(path, "utf8"), { schema: yaml.CORE_SCHEMA });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("sorane.yaml must be a YAML mapping");
  }
  const doc = raw as Record<string, unknown>;
  return mergeConfig({
    site: doc.site as SoraneConfig["site"] | undefined,
    build: doc.build as SoraneConfig["build"] | undefined,
    fonts: doc.fonts as SoraneConfig["fonts"] | undefined,
  });
}

export function parseCwdFlag(argv: string[]): string {
  const i = argv.indexOf("--cwd");
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]!) : process.cwd();
}