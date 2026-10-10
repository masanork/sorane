import * as fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";

const scope = new AsyncLocalStorage<string>();
function inside(path: fs.PathLike): boolean {
  const root = scope.getStore();
  if (!root) throw new Error("filesystem_scope_missing");
  const value = typeof path === "object" && "href" in path ? fileURLToPath(new NodeURL(path.href)) : String(path);
  const rel = relative(root, resolve(value));
  return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel));
}
function check(path: fs.PathLike | number): void {
  if (typeof path === "number" || !inside(path)) throw new Error("filesystem_path_outside_build");
}
export function isolated<T>(root: string, operation: () => T): T { return scope.run(resolve(root), operation); }
export const existsSync: typeof fs.existsSync = (path) => inside(path) && fs.existsSync(path);
// Preserve Node's overloads while applying the same path check to every call.
function guarded<T extends (...args: any[]) => any>(fn: T, paths: number[]): T {
  return ((...args: Parameters<T>) => { for (const index of paths) check(args[index]); return fn(...args); }) as T;
}
export const readFileSync = guarded(fs.readFileSync,[0]);
export const writeFileSync = guarded(fs.writeFileSync,[0]);
export const readdirSync = guarded(fs.readdirSync,[0]);
export const statSync = guarded(fs.statSync,[0]);
export const mkdirSync = guarded(fs.mkdirSync,[0]);
export const rmSync = guarded(fs.rmSync,[0]);
export const copyFileSync = guarded(fs.copyFileSync,[0,1]);
export const cpSync = guarded(fs.cpSync,[0,1]);
export const mkdtempSync = guarded(fs.mkdtempSync,[0]);
