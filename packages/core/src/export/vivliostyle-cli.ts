import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const NPX_VIVLIOSTYLE_PACKAGE = "@vivliostyle/cli@11.0.2";

export type VivliostyleInvocation =
  | { readonly kind: "direct"; readonly binary: string }
  | { readonly kind: "npx" };

export function resolveVivliostyleBinary(): string {
  return process.env.VIVLIOSTYLE?.trim() || "vivliostyle";
}

function directVivliostyleAvailable(binary: string): boolean {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function npxVivliostyleAvailable(): boolean {
  const result = spawnSync(
    "npx",
    ["--yes", NPX_VIVLIOSTYLE_PACKAGE, "--version"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return result.status === 0;
}

/** `vivliostyle` on PATH、`VIVLIOSTYLE`、または `npx @vivliostyle/cli` が使えるか。 */
export function vivliostyleCliAvailable(): boolean {
  const env = process.env.VIVLIOSTYLE?.trim();
  if (env && directVivliostyleAvailable(env)) return true;
  if (directVivliostyleAvailable("vivliostyle")) return true;
  return npxVivliostyleAvailable();
}

/** 実際に起動する Vivliostyle コマンド（直接バイナリ or npx フォールバック）。 */
export function resolveVivliostyleInvocation(): VivliostyleInvocation {
  const env = process.env.VIVLIOSTYLE?.trim();
  if (env && directVivliostyleAvailable(env)) {
    return { kind: "direct", binary: env };
  }
  if (directVivliostyleAvailable("vivliostyle")) {
    return { kind: "direct", binary: "vivliostyle" };
  }
  return { kind: "npx" };
}

export interface VivliostyleHtmlToPdfOptions {
  readonly cwd: string;
  readonly invocation?: VivliostyleInvocation;
}

/** ビルド済み HTML を Vivliostyle CLI で PDF に変換する。 */
export function vivliostyleHtmlToPdf(
  htmlPath: string,
  outPath: string,
  opts: VivliostyleHtmlToPdfOptions,
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  const invocation = opts.invocation ?? resolveVivliostyleInvocation();
  const buildArgs = ["build", htmlPath, "-o", outPath];
  try {
    if (invocation.kind === "direct") {
      execFileSync(invocation.binary, buildArgs, {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    }
    execFileSync(
      "npx",
      ["--yes", NPX_VIVLIOSTYLE_PACKAGE, ...buildArgs],
      { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const detail =
      err instanceof Error &&
      "stderr" in err &&
      Buffer.isBuffer((err as NodeJS.ErrnoException & { stderr?: Buffer }).stderr)
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr.toString("utf8").trim()
        : "";
    const hint =
      invocation.kind === "direct"
        ? invocation.binary
        : `npx ${NPX_VIVLIOSTYLE_PACKAGE}`;
    throw new Error(
      detail.length > 0
        ? `vivliostyle failed: ${detail}`
        : `vivliostyle failed (is '${hint}' available?)`,
    );
  }
}