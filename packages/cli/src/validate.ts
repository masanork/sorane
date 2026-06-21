import { validateSiteContent } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

function parseValidateArgs(argv: string[]): { cwd: string; json: boolean } {
  return {
    cwd: parseCwdFlag(argv),
    json: argv.includes("--json"),
  };
}

function writeHumanReport(report: ReturnType<typeof validateSiteContent>): void {
  for (const file of report.files) {
    for (const f of file.findings) {
      const label = f.severity === "error" ? "" : "warning: ";
      process.stderr.write(`[sorane] ${file.file}: ${label}${f.message}\n`);
    }
  }
  if (report.ok) {
    process.stdout.write("[sorane] all concepts valid\n");
    if (report.warning_count > 0) {
      process.stderr.write(`[sorane] ${report.warning_count} warning(s)\n`);
    }
  }
}

export async function runValidateCmd(argv: string[]): Promise<void> {
  const { cwd, json } = parseValidateArgs(argv);
  const config = loadSoraneConfig(cwd);
  const report = validateSiteContent(cwd, config);

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    writeHumanReport(report);
  }

  if (!report.ok) {
    throw new Error(`${report.error_count} validation error(s)`);
  }
}