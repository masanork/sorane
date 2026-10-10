import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mikaki = resolve(process.argv[2] ?? "../mikaki");
const source = "crates/helpdesk-rp/oidc.ts";
const commit = execFileSync("git", ["-C", mikaki, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const committed = execFileSync("git", ["-C", mikaki, "show", `${commit}:${source}`]);
if (!committed.equals(readFileSync(resolve(mikaki, source)))) {
  throw new Error("Mikaki RP adapter has uncommitted changes; choose a committed baseline first");
}
const vendor = resolve(root, "vendor/mikaki");
mkdirSync(vendor, { recursive: true });
writeFileSync(resolve(vendor, "oidc.ts"), committed);
writeFileSync(resolve(vendor, "LICENSE-MIT"), readFileSync(resolve(mikaki, "LICENSE-MIT")));
writeFileSync(resolve(vendor, "source.json"), JSON.stringify({
  repository: "https://github.com/masanork/mikaki", commit, path: source,
  sha256: createHash("sha256").update(committed).digest("hex"),
  license: "MIT", modifications: [],
}, null, 2) + "\n");
console.log(`Copied unchanged Mikaki RP adapter from ${commit}`);
