import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { C2paConfig } from "./config.ts";

export interface C2paCredentials {
  readonly signCert: string;
  readonly privateKey: string;
  readonly settingsPath?: string;
}

export interface SignRasterOptions {
  readonly binary?: string;
  readonly embed?: boolean;
  readonly createIntent: string;
  readonly credentials: C2paCredentials;
}

const RASTER_RE = /\.(jpe?g|png)$/i;

export function isC2paRasterPath(filePath: string): boolean {
  return RASTER_RE.test(filePath);
}

export function resolveC2paCredentials(
  config: C2paConfig | undefined,
): C2paCredentials | null {
  if (config?.enabled !== true) return null;

  const signCert =
    config.certificate_path ??
    process.env.SORANE_C2PA_CERT ??
    process.env.C2PA_SIGN_CERT;
  const privateKey =
    config.private_key_path ??
    process.env.SORANE_C2PA_KEY ??
    process.env.C2PA_PRIVATE_KEY;

  if (!signCert || !privateKey) return null;
  if (!existsSync(signCert) || !existsSync(privateKey)) return null;

  return {
    signCert,
    privateKey,
    settingsPath: config.settings_path,
  };
}

/** c2patool 0.26+ 向けの署名環境（settings ファイルまたは PEM 環境変数）。 */
function buildSigningEnv(creds: C2paCredentials): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (creds.settingsPath && existsSync(creds.settingsPath)) {
    env.C2PATOOL_SETTINGS = creds.settingsPath;
    return env;
  }
  env.C2PA_PRIVATE_KEY = readFileSync(creds.privateKey, "utf8");
  env.C2PA_SIGN_CERT = readFileSync(creds.signCert, "utf8");
  delete env.C2PATOOL_SETTINGS;
  return env;
}

/** c2patool でラスタ画像に C2PA manifest を埋め込む。失敗時は false。 */
export function signRasterWithC2pa(
  inputPath: string,
  outputPath: string,
  opts: SignRasterOptions,
): { readonly ok: boolean; readonly message?: string } {
  const binary = opts.binary ?? "c2patool";
  const env = buildSigningEnv(opts.credentials);

  const args = [
    inputPath,
    "-c",
    '{"assertions":[]}',
    "--create",
    opts.createIntent,
    "-o",
    outputPath,
    "-f",
  ];
  if (opts.embed === false) args.push("-s");

  const result = spawnSync(binary, args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    return { ok: false, message: msg.length > 0 ? msg : `c2patool exited ${result.status}` };
  }
  if (!probeC2paManifest(outputPath, binary)) {
    return { ok: false, message: "signed output failed C2PA manifest probe" };
  }
  return { ok: true };
}

/** 出力画像に C2PA manifest があるか簡易確認（c2patool --info）。 */
export function probeC2paManifest(
  filePath: string,
  binary = "c2patool",
): boolean {
  const result = spawnSync(binary, [filePath, "--info"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return false;
  const out = `${result.stdout}\n${result.stderr}`;
  return /manifest|validated|active manifest/i.test(out);
}

export function c2patoolAvailable(binary = "c2patool"): boolean {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}