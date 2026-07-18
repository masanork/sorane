import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiagramsConfig } from "../config.ts";
import {
  guardedFetch,
  readGuardedResponse,
  type GuardedFetchOptions,
} from "../fetch-url-guard.ts";
import { diagramSourceHash } from "./diagram-hash.ts";

const DEFAULT_KROKI_URL = "https://kroki.io";
const MAX_SVG_BYTES = 5 * 1024 * 1024;

export function isPlantumlCompileEnabled(config?: DiagramsConfig): boolean {
  return config?.enabled !== false && config?.plantuml?.enabled === true;
}

export function resolvePlantumlKrokiUrl(config: DiagramsConfig): string {
  const raw = config.plantuml?.kroki_url ?? DEFAULT_KROKI_URL;
  return raw.replace(/\/+$/, "");
}

export function isPlantumlLang(lang: string | null | undefined): boolean {
  return lang === "plantuml" || lang === "puml";
}

export interface CompilePlantumlOptions {
  readonly source: string;
  readonly krokiUrl: string;
  readonly outDir: string;
  readonly fetchFn?: typeof fetch;
}

export interface CompilePlantumlResult {
  readonly hash: string;
  readonly svgFileName: string;
  readonly ok: boolean;
  readonly warning?: string;
}

/** PlantUML source → SVG via Kroki HTTP API (cached by content hash). */
export async function compilePlantumlToSvg(
  opts: CompilePlantumlOptions,
): Promise<CompilePlantumlResult> {
  const hash = diagramSourceHash(opts.source);
  const svgFileName = `${hash}.svg`;
  const dest = join(opts.outDir, svgFileName);
  mkdirSync(opts.outDir, { recursive: true });

  if (existsSync(dest)) {
    return { hash, svgFileName, ok: true };
  }

  const endpoint = `${opts.krokiUrl.replace(/\/+$/, "")}/plantuml/svg`;
  const fetchOpts: GuardedFetchOptions = {
    fetchFn: opts.fetchFn,
    maxBytes: MAX_SVG_BYTES,
  };

  try {
    const response = await guardedFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Accept: "image/svg+xml",
        },
        body: opts.source,
        signal: AbortSignal.timeout(120_000),
      },
      fetchOpts,
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      return {
        hash,
        svgFileName,
        ok: false,
        warning: `Kroki HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    const buf = await readGuardedResponse(response, MAX_SVG_BYTES);
    const text = buf.toString("utf8");
    if (!text.includes("<svg")) {
      return {
        hash,
        svgFileName,
        ok: false,
        warning: "Kroki response is not SVG",
      };
    }
    writeFileSync(dest, text, "utf8");
    return { hash, svgFileName, ok: true };
  } catch (err) {
    const warning = err instanceof Error ? err.message : String(err);
    return { hash, svgFileName, ok: false, warning };
  }
}
