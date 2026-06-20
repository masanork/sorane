import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function vendorModel(
  modelRoot: string,
  modelId: string,
  outRoot: string,
): boolean {
  const srcDir = resolve(modelRoot, modelId);
  const onnx = join(srcDir, "onnx", "model_quantized.onnx");
  if (!existsSync(onnx)) return false;

  const destDir = join(outRoot, "models", modelId);
  mkdirSync(join(destDir, "onnx"), { recursive: true });
  for (const name of [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
  ]) {
    const src = join(srcDir, name);
    if (existsSync(src)) copyFileSync(src, join(destDir, name));
  }
  copyFileSync(onnx, join(destDir, "onnx", "model_quantized.onnx"));
  return true;
}

export function vendorRuntime(outRoot: string, repoRoot?: string): boolean {
  const root = repoRoot ?? packageRoot();
  const tjs = resolve(root, "node_modules/@huggingface/transformers/dist/transformers.web.js");
  const ortDir = resolve(root, "node_modules/onnxruntime-web/dist");
  const ort = join(ortDir, "ort.webgpu.bundle.min.mjs");
  if (!existsSync(tjs) || !existsSync(ort)) return false;

  const libDir = join(outRoot, "assets", "search", "lib");
  mkdirSync(libDir, { recursive: true });
  copyFileSync(tjs, join(libDir, "transformers.web.js"));
  copyFileSync(ort, join(libDir, "ort.webgpu.bundle.min.mjs"));
  for (const name of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
    const src = join(ortDir, name);
    if (existsSync(src)) copyFileSync(src, join(libDir, name));
  }
  return true;
}

export function copySearchScript(outRoot: string, repoRoot?: string): boolean {
  const root = repoRoot ?? packageRoot();
  const src = join(root, "packages/search/assets/search.mjs");
  if (!existsSync(src)) return false;
  const destDir = join(outRoot, "assets");
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, "search.mjs"));
  return true;
}

export function readSearchScript(repoRoot?: string): string {
  const root = repoRoot ?? packageRoot();
  return readFileSync(join(root, "packages/search/assets/search.mjs"), "utf8");
}