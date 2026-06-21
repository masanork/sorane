import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, describe } from "node:test";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";

describe("validateSiteContent", () => {
  test("valid minimal site has ok report", () => {
    const report = validateSiteContent("examples/minimal", mergeConfig({}));
    assert.equal(report.schema_version, 1);
    assert.equal(report.ok, true);
    assert.equal(report.error_count, 0);
    assert.ok(report.files.length >= 1);
    for (const file of report.files) {
      assert.equal(file.ok, true);
      assert.equal(file.findings.filter((f) => f.severity === "error").length, 0);
    }
  });

  test("invalid frontmatter produces structured errors", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-validate-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "bad.md"),
      "---\ntype: playbook\n---\n\nBody\n",
      "utf8",
    );
    const report = validateSiteContent(
      root,
      mergeConfig({ build: { content_dir: "content" } } as Partial<SoraneConfig>),
    );
    assert.equal(report.ok, false);
    assert.ok(report.error_count >= 1);
    const bad = report.files.find((f) => f.file === "bad.md");
    assert.ok(bad);
    assert.equal(bad!.ok, false);
    const typeErr = bad!.findings.find((f) => f.severity === "error" && f.where === "type");
    assert.ok(typeErr);
    assert.equal(typeErr!.category, "okf");
  });

  test("0.3 unknown type is warning only", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-validate-03-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "playbook.md"),
      "---\ntype: playbook\ntitle: Ops\nprofile: sorane-okf/0.3\n---\n\nBody\n",
      "utf8",
    );
    const report = validateSiteContent(
      root,
      mergeConfig({ build: { content_dir: "content" } } as Partial<SoraneConfig>),
    );
    assert.equal(report.ok, true);
    assert.equal(report.error_count, 0);
    assert.ok(report.warning_count >= 1);
    const file = report.files.find((f) => f.file === "playbook.md");
    assert.ok(file?.findings.some((f) => f.severity === "warning" && f.category === "okf"));
  });

  test("heading warnings are categorized", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-validate-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "headings.md"),
      "---\ntype: article\ntitle: T\nprofile: sorane-okf/0.1\n---\n\n#### Skip h2\n",
      "utf8",
    );
    const report = validateSiteContent(
      root,
      mergeConfig({ build: { content_dir: "content" } } as Partial<SoraneConfig>),
    );
    assert.equal(report.ok, true);
    assert.ok(report.warning_count >= 1);
    const file = report.files.find((f) => f.file === "headings.md");
    assert.ok(file?.findings.some((f) => f.category === "heading" && f.severity === "warning"));
  });
});

describe("validate CLI --json", () => {
  test("prints JSON to stdout", async () => {
    const { spawnSync } = await import("node:child_process");
    const cli = new URL("../packages/cli/bin/sorane.mjs", import.meta.url).pathname;
    const r = spawnSync(process.execPath, [cli, "validate", "--cwd", "examples/minimal", "--json"], {
      encoding: "utf8",
      cwd: new URL("..", import.meta.url).pathname,
    });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; schema_version: number };
    assert.equal(parsed.schema_version, 1);
    assert.equal(parsed.ok, true);
  });
});