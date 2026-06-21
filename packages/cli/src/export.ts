import { runDocxExport, runPdfExport } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

function parseFormatFlag(argv: string[]): string {
  const i = argv.indexOf("--format");
  if (i < 0 || !argv[i + 1]) {
    throw new Error("export requires --format <docx|pdf>");
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

function parseHtmlFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--html");
  if (i < 0 || !argv[i + 1]) return undefined;
  return argv[i + 1]!;
}

export async function runExportCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const format = parseFormatFlag(argv);
  const out = parseOutFlag(argv);
  const file = parseFileFlag(argv);
  const html = parseHtmlFlag(argv);

  if (format === "docx") {
    if (html !== undefined) {
      throw new Error("--html is only supported with --format pdf");
    }
    const result = runDocxExport({ cwd, config, out, file });
    for (const f of result.files) {
      process.stdout.write(`[sorane] exported ${f}\n`);
    }
    return;
  }

  if (format === "pdf") {
    const result = runPdfExport({ cwd, config, out, file, html });
    for (const f of result.files) {
      process.stdout.write(`[sorane] exported ${f}\n`);
    }
    return;
  }

  throw new Error(`unsupported export format: ${format} (supported: docx, pdf)`);
}