import { readFileSync } from "node:fs";
// @ts-expect-error wasm-bindgen glue
import * as bg from "../wasm/bunsen_font_subsetter_bg.js";

let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const url = new URL("../wasm/bunsen_font_subsetter_bg.wasm", import.meta.url);
    const bytes = readFileSync(url);
    const imports = {
      "./bunsen_font_subsetter_bg.js": bg as unknown as Record<string, WebAssembly.ImportValue>,
    };
    const result = await WebAssembly.instantiate(bytes, imports);
    const instance = "instance" in result ? result.instance : result;
    bg.__wbg_set_wasm(instance.exports);
    const exports = instance.exports as Record<string, unknown>;
    if (typeof exports.__wbindgen_start === "function") {
      (exports.__wbindgen_start as () => void)();
    }
  })();
  return initPromise;
}

export async function subsetWoff2(fontBytes: Uint8Array, text: string): Promise<Uint8Array> {
  await ensureInit();
  const out = bg.subset_font(fontBytes, text) as Uint8Array;
  if (out.length === 0) {
    throw new Error("font subsetter returned empty bytes");
  }
  return out;
}