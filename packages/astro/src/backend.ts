type AstroLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
};

export type SoraneAstroBackend = "auto" | "ts" | "wasm" | "cli";
export type ResolvedSoraneAstroBackend = "ts" | "wasm" | "cli";

/** Resolve the active artifact backend. Only `ts` is implemented today. */
export function resolveSoraneAstroBackend(
  backend: SoraneAstroBackend | undefined,
  logger?: AstroLogger,
): ResolvedSoraneAstroBackend {
  const requested = backend ?? "auto";
  if (requested === "ts" || requested === "auto") return "ts";
  logger?.warn?.(
    `[sorane/astro] backend "${requested}" is not available yet; using TypeScript`,
  );
  return "ts";
}