import { runBuild } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

export async function runBuildCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const clean = argv.includes("--clean");
  const result = await runBuild({ cwd, config, clean });
  process.stdout.write(`[sorane] built ${result.pages} page(s) → ${config.build.out_dir}/\n`);
}