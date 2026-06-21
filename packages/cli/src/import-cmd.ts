import { fetchImportImages, parseEncodingHint, runImport } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

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
  const dryRun = argv.includes("--dry-run");
  const encodingRaw = parseEncodingFlag(argv);
  const result = runImport({
    cwd,
    input: parseInputFlag(argv),
    format: parseFormatFlag(argv),
    out: parseOutFlag(argv),
    encoding: encodingRaw !== undefined ? parseEncodingHint(encodingRaw) : 'auto',
    dryRun,
    skipDrafts: !argv.includes("--include-drafts"),
  });

  const mode = dryRun ? "would import" : "imported";
  process.stdout.write(
    `[sorane] ${mode} ${result.files.length} file(s) via ${result.format} (${result.encoding})\n`,
  );
  for (const file of result.files) {
    process.stdout.write(`[sorane]   ${file}\n`);
  }

  if (argv.includes("--fetch-images") && !dryRun && result.files.length > 0) {
    const config = loadSoraneConfig(cwd);
    const staticDir = config.build.static_dir ?? "static";
    const fetchResult = await fetchImportImages({
      cwd,
      markdownPaths: result.files,
      staticDir,
    });
    process.stdout.write(
      `[sorane] fetched ${fetchResult.downloadedCount} image(s); updated ${fetchResult.updatedFiles.length} file(s)\n`,
    );
  }
}