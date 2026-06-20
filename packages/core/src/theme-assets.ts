import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** サイト cwd または親ディレクトリからテーマ資産サブディレクトリを探す。 */
export function resolveThemeAssetDir(cwd: string, subdir: string): string | null {
  const rel = join("templates", "default", "assets", subdir);
  let dir = resolve(cwd);
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}