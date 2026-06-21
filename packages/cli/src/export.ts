import { runDocxExport } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

function parseFormatFlag(argv: string[]): string {
  const i = argv.indexOf("--format");
  if (i < 0 || !argv[i + 1]) {
    throw new Error("export requires --format <docx>");
  }
  return argv[i + 1]!;
}

function parseOutFlag(argv: string[]): string {
  const i = argv.indexOf("--out");
  if (i < 0 || !argv[i + 1]) {
    throw new Error("export requires --out <path>");
  }
  return argv[i + 1]!;
}

function parseFileFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--file");
  if (i < 0 || !argv[i + 1]) return undefined;
  return argv[i + 1]!;
}

export async function runExportCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const format = parseFormatFlag(argv);
  if (format !== "docx") {
    throw new Error(`unsupported export format: ${format} (supported: docx)`);
  }
  const result = runDocxExport({
    cwd,
    config,
    out: parseOutFlag(argv),
    file: parseFileFlag(argv),
  });
  for (const file of result.files) {
    process.stdout.write(`[sorane] exported ${file}\n`);
  }
}