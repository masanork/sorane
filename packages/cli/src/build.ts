import { runBuild } from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

export async function runBuildCmd(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = loadSoraneConfig(cwd);
  const clean = argv.includes("--clean");
  const result = await runBuild({
    cwd,
    config,
    clean,
    skipC2pa: argv.includes("--skip-c2pa"),
    includeDrafts: argv.includes("--drafts"),
    preview: argv.includes("--preview"),
  });
  const secs = (result.durationMs / 1000).toFixed(1);
  process.stdout.write(
    `[sorane] built ${result.pages} page(s) in ${secs}s → ${config.build.out_dir}/\n`,
  );
}