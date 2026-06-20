#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

/**
 * Assemble ruri-v3-30m for local transformers.js inference.
 *
 *   node scripts/fetch-model.ts [--out vendor/models/ruri-v3-30m]
 */

const HF = "https://huggingface.co";

const FILES: { repo: string; path: string; dest: string }[] = [
  { repo: "onnx-community/ruri-v3-30m-ONNX", path: "config.json", dest: "config.json" },
  {
    repo: "onnx-community/ruri-v3-30m-ONNX",
    path: "onnx/model_quantized.onnx",
    dest: "onnx/model_quantized.onnx",
  },
  { repo: "cl-nagoya/ruri-v3-30m", path: "tokenizer.json", dest: "tokenizer.json" },
  { repo: "cl-nagoya/ruri-v3-30m", path: "tokenizer_config.json", dest: "tokenizer_config.json" },
  { repo: "cl-nagoya/ruri-v3-30m", path: "special_tokens_map.json", dest: "special_tokens_map.json" },
];

function parseOut(argv: string[]): string {
  const a = argv.slice(2);
  const i = a.indexOf("--out");
  return i >= 0 && a[i + 1] ? a[i + 1]! : "vendor/models/ruri-v3-30m";
}

async function download(repo: string, path: string): Promise<Buffer> {
  const url = `${HF}/${repo}/resolve/main/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} ${res.statusText}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(argv: string[]): Promise<number> {
  const out = parseOut(argv);
  mkdirSync(out, { recursive: true });

  for (const f of FILES) {
    const dest = join(out, f.dest);
    process.stdout.write(`fetch ${f.repo}/${f.path}\n`);
    const buf = await download(f.repo, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    process.stdout.write(`  → ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)\n`);
  }

  const onnxPath = join(out, "onnx/model_quantized.onnx");
  const sha = createHash("sha256").update(readFileSync(onnxPath)).digest("hex");
  writeFileSync(join(out, "version.txt"), sha + "\n", "utf8");
  process.stdout.write(`\nmodel assembled at ${out}\n  onnx sha256: ${sha}\n`);

  if (!existsSync(join(out, "tokenizer.json"))) {
    process.stderr.write("warning: tokenizer.json missing\n");
    return 1;
  }
  return 0;
}

main(process.argv).then((code) => process.exit(code));