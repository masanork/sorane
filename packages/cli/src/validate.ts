import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateSource } from "@sorane/okf";
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

export async function runValidateCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const contentDir = resolve(cwd, config.build.content_dir);
  if (!existsSync(contentDir)) {
    throw new Error(`content directory not found: ${contentDir}`);
  }

  let errors = 0;
  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    const result = validateSource(rel, source);
    for (const w of result.warnings) {
      process.stderr.write(`[sorane] ${rel}: warning: ${w}\n`);
    }
    if (!result.ok) {
      for (const issue of result.issues) {
        process.stderr.write(`[sorane] ${rel}: ${issue.message}\n`);
      }
      errors += result.issues.length;
    }
  }

  if (errors > 0) {
    throw new Error(`${errors} validation error(s)`);
  }
  process.stdout.write("[sorane] all concepts valid\n");
}