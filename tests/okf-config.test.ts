import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { okfValidateOptions, normalizeOkfConfig } from "../packages/core/src/okf-config.ts";
import { validateSiteContent } from "../packages/core/src/validate-site.ts";
import { parseConcept, validateSource } from "@sorane/okf";

describe("normalizeOkfConfig", () => {
  test("不正な default_profile はエラー", () => {
    let threw = false;
    try {
      normalizeOkfConfig({ default_profile: "bad/profile" });
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/default_profile/);
    }
    expect(threw).toBe(true);
  });

  test("unknown_type は warn / error のみ", () => {
    let threw = false;
    try {
      normalizeOkfConfig({ unknown_type: "ignore" as "warn" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("okf.default_profile", () => {
  test("frontmatter 無し profile は site 既定を使う", () => {
    const opts = okfValidateOptions(
      mergeConfig({
        okf: { default_profile: "sorane-okf/0.3" },
      } as Partial<SoraneConfig>),
    );
    const p = parseConcept(
      "",
      "playbook.md",
      "---\ntype: playbook\ntitle: Ops\n---\n\nBody\n",
      opts,
    );
    expect(p.concept.profile).toBe("sorane-okf/0.3");
    expect(p.validation.ok).toBe(true);
    expect(p.validation.warnings.some((w) => w.includes("unknown type"))).toBe(true);
  });
});

describe("okf.unknown_type", () => {
  test("error では未知 type が validate エラー", () => {
    const opts = okfValidateOptions(
      mergeConfig({
        okf: { default_profile: "sorane-okf/0.3", unknown_type: "error" },
      } as Partial<SoraneConfig>),
    );
    const r = validateSource(
      "playbook.md",
      "---\ntype: playbook\ntitle: Ops\n---\n\nBody\n",
      opts,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.where === "type")).toBe(true);
  });

  test("validateSiteContent に統合される", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-okf-site-"));
    const contentDir = join(root, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "playbook.md"),
      "---\ntype: playbook\ntitle: Ops\n---\n\nBody\n",
    );
    const report = validateSiteContent(
      root,
      mergeConfig({
        build: { content_dir: "content" },
        okf: { default_profile: "sorane-okf/0.3", unknown_type: "error" },
      } as Partial<SoraneConfig>),
    );
    expect(report.ok).toBe(false);
    const file = report.files.find((f) => f.file === "playbook.md");
    expect(file?.findings.some((f) => f.severity === "error" && f.where === "type")).toBe(true);
  });
});