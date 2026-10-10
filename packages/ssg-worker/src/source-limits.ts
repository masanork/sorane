export const MAX_FILES = 128, MAX_FILE_BYTES = 262144, MAX_SOURCE_BYTES = 4194304;
export function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && path.split("/").every((part) =>
    part.length > 0 && part !== "." && part !== ".." && part.toLowerCase() !== ".git" && !/[\\\x00-\x1f\x7f]/.test(part));
}
