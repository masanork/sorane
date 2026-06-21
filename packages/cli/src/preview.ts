import { startPreviewServer } from "@sorane/core";
import { runBuildCmd } from "./build.ts";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";
import { runWatchCmd } from "./watch.ts";
import { resolve } from "node:path";

export function parsePortFlag(argv: string[]): number | undefined {
  const i = argv.indexOf("--port");
  if (i < 0 || i + 1 >= argv.length) return undefined;
  const n = Number.parseInt(argv[i + 1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function previewBuildArgv(cwd: string, clean: boolean): string[] {
  const args = ["--cwd", cwd, "--drafts", "--preview"];
  if (clean) args.push("--clean");
  return args;
}

export async function runPreviewCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const port = parsePortFlag(argv) ?? 4321;
  const withWatch = argv.includes("--watch");
  const config = loadSoraneConfig(cwd);
  const outDir = resolve(cwd, config.build.out_dir);

  await runBuildCmd(previewBuildArgv(cwd, true));

  startPreviewServer(outDir, port, (url) => {
    process.stdout.write(`[sorane] preview at ${url}\n`);
    process.stdout.write("[sorane] Ctrl+C to stop\n");
  });

  if (withWatch) {
    await runWatchCmd([...previewBuildArgv(cwd, false), "--watch-preview"]);
  } else {
    await new Promise<void>(() => {});
  }
}