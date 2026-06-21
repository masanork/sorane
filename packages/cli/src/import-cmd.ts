import { parseEncodingHint, runImport } from "@sorane/core";
import { parseCwdFlag } from "./config-load.ts";

function parseInputFlag(argv: string[]): string {
  const i = argv.indexOf("--input");
  if (i < 0 || !argv[i + 1]) {
    throw new Error("import requires --input <export-file>");
  }
  return argv[i + 1]!;
}

function parseFormatFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--format");
  if (i < 0 || !argv[i + 1]) return undefined;
  return argv[i + 1]!;
}

function parseOutFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--out");
  if (i < 0 || !argv[i + 1]) return undefined;
  return argv[i + 1]!;
}

function parseEncodingFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--encoding");
  if (i < 0 || !argv[i + 1]) return undefined;
  return argv[i + 1]!;
}

export async function runImportCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const encodingRaw = parseEncodingFlag(argv);
  const result = runImport({
    cwd,
    input: parseInputFlag(argv),
    format: parseFormatFlag(argv),
    out: parseOutFlag(argv),
    encoding: encodingRaw !== undefined ? parseEncodingHint(encodingRaw) : 'auto',
    dryRun: argv.includes("--dry-run"),
    skipDrafts: !argv.includes("--include-drafts"),
  });

  const mode = argv.includes("--dry-run") ? "would import" : "imported";
  process.stdout.write(
    `[sorane] ${mode} ${result.files.length} file(s) via ${result.format} (${result.encoding})\n`,
  );
  for (const file of result.files) {
    process.stdout.write(`[sorane]   ${file}\n`);
  }
}