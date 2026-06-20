import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { migrateToOkf, parseBumpProfileArg } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

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

export async function runMigrateCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const contentDir = resolve(cwd, config.build.content_dir);
  const dryRun = argv.includes("--dry-run");
  const bumpProfile = parseBumpProfileArg(argv);

  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  let count = 0;
  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    const migrated = migrateToOkf(source, rel, bumpProfile ? { bumpProfile } : undefined);
    if (migrated !== source) {
      count++;
      if (dryRun) {
        process.stdout.write(`[sorane] would migrate: ${rel}\n`);
      } else {
        writeFileSync(abs, migrated, "utf8");
        process.stdout.write(`[sorane] migrated: ${rel}\n`);
      }
    }
  }
  process.stdout.write(`[sorane] ${dryRun ? "would migrate" : "migrated"} ${count} file(s)\n`);
}