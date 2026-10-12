import { spawn } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, delimiter, matchesGlob, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configPath = fileURLToPath(new URL("../.c8rc.json", import.meta.url));
const tsxLoader = import.meta.resolve("tsx/esm");

export function coverageEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const loader = `--import=${tsxLoader}`;
  const env: NodeJS.ProcessEnv = {
    ...base,
    NODE_OPTIONS: base.NODE_OPTIONS?.includes(loader) ? base.NODE_OPTIONS : [base.NODE_OPTIONS, loader].filter(Boolean).join(" "),
    // Child CLIs can change cwd. Resolve both the loader and config absolutely,
    // and use the same Node executable even when the parent came from npx.
    TSX_TSCONFIG_PATH: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
    PATH: [dirname(process.execPath), base.PATH].filter(Boolean).join(delimiter),
  };
  // Each c8 invocation owns its collection directory. Nested regression runs
  // must not write their profiles into the parent run's directory.
  delete env.NODE_V8_COVERAGE;
  return env;
}

export function verifyCoverageTransforms(directory: string, cwd: string) {
  cwd = realpathSync(cwd);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { include: string[]; exclude: string[] };
  const fingerprints = new Map<string, string>();
  for (const name of readdirSync(directory).filter(name => name.endsWith(".json"))) {
    const profile = JSON.parse(readFileSync(join(directory, name), "utf8"));
    for (const script of profile.result ?? []) {
      const url = script.url.startsWith("file:") ? script.url : isAbsolute(script.url) ? pathToFileURL(script.url).href : undefined;
      if (!url) continue;
      const file = relative(cwd, fileURLToPath(url)).split("\\").join("/");
      if (!config.include.some(pattern => matchesGlob(file, pattern)) || config.exclude.some(pattern => matchesGlob(file, pattern))) continue;
      const map = profile["source-map-cache"]?.[url] ?? profile["source-map-cache"]?.[script.url];
      if (!map?.data || !Array.isArray(map.lineLengths)) throw new Error(`Missing TypeScript source map: ${file}`);
      const fingerprint = createHash("sha256").update(JSON.stringify({
        lines: map.lineLengths, mappings: map.data.mappings, sources: map.data.sourcesContent,
      })).digest("hex");
      if (fingerprints.has(file) && fingerprints.get(file) !== fingerprint) throw new Error(`Mixed TypeScript transforms: ${file}`);
      fingerprints.set(file, fingerprint);
    }
  }
  if (!fingerprints.size) throw new Error("No package coverage profiles were collected");
  return fingerprints.size;
}

export async function runCoverage(options: {
  cwd?: string; reportsDir?: string; files?: string[]; env?: NodeJS.ProcessEnv; quiet?: boolean;
} = {}) {
  const cwd = realpathSync(options.cwd ?? process.cwd()), reportsDir = options.reportsDir ?? resolve(cwd, "coverage");
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(process.execPath, [require.resolve("c8/bin/c8.js"), "--config", configPath, "--reports-dir", reportsDir,
      "--temp-directory", join(reportsDir, "tmp"),
      process.execPath, "--test", "--test-isolation=none", ...(options.files ?? ["tests/**/*.test.ts"])], {
      cwd, env: coverageEnvironment(options.env), stdio: options.quiet ? "ignore" : "inherit",
    });
    child.on("error", reject); child.on("close", code => done(code ?? 1));
  });
  // Never merge native type-stripping offsets with tsx-generated offsets for
  // the same file. c8 otherwise selects one map depending on profile order.
  try {
    const files = verifyCoverageTransforms(join(reportsDir, "tmp"), cwd);
    if (!options.quiet) console.log(`[coverage] Consistent TypeScript source maps: ${files} files`);
  } catch (error) {
    if (!options.quiet) console.error(`[coverage] ${error instanceof Error ? error.message : "Profile verification failed"}`);
    return 1;
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCoverage();
}
