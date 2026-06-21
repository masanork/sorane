import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "./_expect.ts";

const CLI = new URL("../packages/cli/bin/sorane.mjs", import.meta.url).pathname;

function runCli(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? join(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

describe("sorane CLI", () => {
  test("usage を出す", () => {
    const r = runCli([]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("usage: sorane");
  });

  test("未知コマンドは exit 1", () => {
    const r = runCli(["unknown-cmd"]);
    expect(r.status).toBe(1);
  });

  test("validate --json on minimal example", () => {
    const r = runCli(["validate", "--cwd", "examples/minimal", "--json"]);
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as { ok: boolean };
    expect(report.ok).toBe(true);
  });

  test("build --clean on minimal example", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-build-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nWelcome.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n",
      "utf8",
    );
    try {
      const r = runCli(["build", "--cwd", root, "--clean", "--skip-c2pa"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("built");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("migrate --dry-run", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-migrate-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "old.md"),
      '---\ntitle: Old\ndate: "2025-06-01"\nlayout: article\n---\n\nBody\n',
      "utf8",
    );
    try {
      const r = runCli(["migrate", "--cwd", root, "--dry-run"]);
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toMatch(/migrate|OKF|okf/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("search 引数無しは usage", () => {
    const r = runCli(["search", "--cwd", "examples/minimal"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage: sorane search");
  });
});