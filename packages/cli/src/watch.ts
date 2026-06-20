import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";
import { runBuildCmd } from "./build.ts";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

const DEBOUNCE_MS = 350;

function parseWatchArgv(argv: string[]): { cwd: string; clean: boolean; buildArgv: string[] } {
  const cwd = parseCwdFlag(argv);
  const clean = argv.includes("--clean");
  const buildArgv = ["--cwd", cwd];
  if (clean) buildArgv.push("--clean");
  return { cwd, clean, buildArgv };
}

function watchPaths(cwd: string, contentDir: string): string[] {
  const paths = [resolve(cwd, contentDir), resolve(cwd, "sorane.yaml")];
  const staticDir = resolve(cwd, "static");
  if (existsSync(staticDir)) paths.push(staticDir);
  return paths;
}

export async function runWatchCmd(argv: string[]): Promise<void> {
  const { cwd, clean, buildArgv } = parseWatchArgv(argv);
  const config = loadSoraneConfig(cwd);
  const contentDir = config.build.content_dir;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let pending = false;

  const runOnce = async (initial: boolean): Promise<void> => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    try {
      if (initial && !clean) {
        await runBuildCmd(buildArgv);
      } else {
        await runBuildCmd([...buildArgv.filter((a) => a !== "--clean"), "--clean"]);
      }
    } catch (err) {
      process.stderr.write(
        `[sorane] watch build failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      building = false;
      if (pending) {
        pending = false;
        void runOnce(false);
      }
    }
  };

  process.stdout.write("[sorane] watching for changes (Ctrl+C to stop)\n");
  await runOnce(true);

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runOnce(false);
    }, DEBOUNCE_MS);
  };

  for (const target of watchPaths(cwd, contentDir)) {
    if (!existsSync(target)) continue;
    try {
      watch(target, { recursive: true }, (_event, filename) => {
        if (filename?.includes(".sorane/")) return;
        schedule();
      });
    } catch {
      watch(target, () => schedule());
    }
  }
}