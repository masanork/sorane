import { requireOptionalModule } from "@sorane/core";

export function wantsAutoInstall(argv: readonly string[]): boolean {
  return argv.includes("--yes") || argv.includes("-y");
}

export async function loadSearchModule(
  cwd: string,
  command: "index" | "search",
  argv: readonly string[],
): Promise<typeof import("@sorane/search")> {
  return requireOptionalModule<typeof import("@sorane/search")>({
    packageName: "@sorane/search",
    feature: command === "index" ? "search indexing" : "search queries",
    command,
    cwd,
    autoInstall: wantsAutoInstall(argv),
  });
}