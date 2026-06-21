import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";

export interface OptionalPackageSpec {
  readonly packageName: string;
  readonly feature: string;
  readonly command?: string;
}

export class OptionalPackageMissingError extends Error {
  readonly packageName: string;
  readonly installCommand: string;

  constructor(spec: OptionalPackageSpec) {
    const installCommand = installCommandFor(spec.packageName);
    super(formatMissingOptionalMessage(spec, installCommand));
    this.name = "OptionalPackageMissingError";
    this.packageName = spec.packageName;
    this.installCommand = installCommand;
  }
}

export function isOptionalModuleMissing(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  const msg = err.message;
  return (
    msg.includes("Cannot find package") ||
    msg.includes("Cannot find module") ||
    msg.includes("Cannot resolve")
  );
}

export function detectPackageManager(cwd: string): {
  readonly command: string;
  readonly installArgs: (packageName: string) => readonly string[];
} {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm/")) {
    return { command: "pnpm", installArgs: (pkg) => ["add", pkg] };
  }
  if (ua.startsWith("yarn/")) {
    return { command: "yarn", installArgs: (pkg) => ["add", pkg] };
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return { command: "pnpm", installArgs: (pkg) => ["add", pkg] };
  }
  if (existsSync(join(cwd, "yarn.lock"))) {
    return { command: "yarn", installArgs: (pkg) => ["add", pkg] };
  }
  return { command: "npm", installArgs: (pkg) => ["install", pkg] };
}

export function installCommandFor(packageName: string, cwd = process.cwd()): string {
  const pm = detectPackageManager(cwd);
  const args = pm.installArgs(packageName);
  return `${pm.command} ${args.join(" ")}`;
}

export function formatMissingOptionalMessage(
  spec: OptionalPackageSpec,
  installCommand = installCommandFor(spec.packageName),
): string {
  const lead = spec.command
    ? `The "${spec.command}" command requires optional package ${spec.packageName}`
    : `Optional package ${spec.packageName} is required`;
  return (
    `[sorane] ${lead} (${spec.feature}).\n\n` +
    `Install it with:\n` +
    `  ${installCommand}\n`
  );
}

export function warnOptionalPackageMissing(spec: OptionalPackageSpec, cwd = process.cwd()): void {
  const installCommand = installCommandFor(spec.packageName, cwd);
  process.stderr.write(`${formatMissingOptionalMessage(spec, installCommand)}\n`);
}

export async function importOptionalModule<T extends object>(
  packageName: string,
): Promise<T | undefined> {
  try {
    return (await import(packageName)) as T;
  } catch (err) {
    if (isOptionalModuleMissing(err)) return undefined;
    throw err;
  }
}

export interface RequireOptionalModuleOptions extends OptionalPackageSpec {
  readonly cwd?: string;
  /** `sorane index --yes` などで対話なしインストール */
  readonly autoInstall?: boolean;
  readonly interactive?: boolean;
}

function canPrompt(interactive: boolean | undefined): boolean {
  if (interactive === false) return false;
  if (process.env.CI) return false;
  if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
  return true;
}

async function confirmInstall(packageName: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Install ${packageName} now? [Y/n] `);
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

function runPackageInstall(packageName: string, cwd: string): boolean {
  const pm = detectPackageManager(cwd);
  const args = [...pm.installArgs(packageName)];
  process.stderr.write(`[sorane] running: ${pm.command} ${args.join(" ")}\n`);
  const result = spawnSync(pm.command, args, { cwd, stdio: "inherit", env: process.env });
  return result.status === 0;
}

export async function requireOptionalModule<T extends object>(
  opts: RequireOptionalModuleOptions,
): Promise<T> {
  const cwd = opts.cwd ?? process.cwd();
  const loaded = await importOptionalModule<T>(opts.packageName);
  if (loaded) return loaded;

  const spec: OptionalPackageSpec = {
    packageName: opts.packageName,
    feature: opts.feature,
    command: opts.command,
  };
  const installCommand = installCommandFor(opts.packageName, cwd);
  process.stderr.write(`${formatMissingOptionalMessage(spec, installCommand)}\n`);

  const shouldInstall =
    opts.autoInstall === true || (opts.autoInstall !== false && canPrompt(opts.interactive));

  if (shouldInstall) {
    const proceed = opts.autoInstall === true ? true : await confirmInstall(opts.packageName);
    if (proceed && runPackageInstall(opts.packageName, cwd)) {
      const retry = await importOptionalModule<T>(opts.packageName);
      if (retry) return retry;
      process.stderr.write(
        `[sorane] installed ${opts.packageName} but import still failed; re-run the command.\n`,
      );
    }
  }

  throw new OptionalPackageMissingError(spec);
}