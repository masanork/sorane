import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuild } from "../packages/core/src/build.ts";
import { mergeConfig, type SoraneConfig } from "../packages/core/src/config.ts";
import { buildLlmsTxt } from "../packages/core/src/site-meta.ts";
import {
  buildCloudflareOpsManifest,
  CLOUDFLARE_OPS_SCHEMA_VERSION,
  llmsHostingSection,
  RECOMMENDED_LOGPUSH_FIELDS,
} from "../packages/core/src/hosting-cloudflare.ts";

const hostingSite: SoraneConfig["site"] = {
  title: "Gov Site",
  description: "Public site",
  base_url: "https://www.example.go.jp",
  lang: "ja",
  findability: { disallow: ["/assets/search/lib/"] },
  hosting: {
    provider: "cloudflare",
    cloudflare: {
      pages_project: "gov-site",
      zone_name: "www.example.go.jp",
      web_analytics: true,
      logpush: {
        destination: "r2",
        r2_bucket: "gov-access-logs",
      },
    },
  },
};

describe("buildCloudflareOpsManifest", () => {
  test("hosting 無しなら undefined", () => {
    expect(
      buildCloudflareOpsManifest({
        title: "T",
        description: "d",
        base_url: "",
        lang: "ja",
      }),
    ).toBe(undefined);
  });

  test("manifest に Logpush メタを含める", () => {
    const m = buildCloudflareOpsManifest(hostingSite)!;
    expect(m.schema_version).toBe(CLOUDFLARE_OPS_SCHEMA_VERSION);
    expect(m.pages_project).toBe("gov-site");
    expect(m.logpush?.dataset).toBe("http_requests");
    expect(m.logpush?.r2_bucket).toBe("gov-access-logs");
    expect(m.logpush?.exclude_paths).toContain("/assets/search/lib/");
    expect(m.logpush?.recommended_fields).toEqual([...RECOMMENDED_LOGPUSH_FIELDS]);
  });
});

describe("llmsHostingSection", () => {
  test("Access logs 節を出す", () => {
    const lines = llmsHostingSection(hostingSite, "https://www.example.go.jp");
    const text = lines.join("\n");
    expect(text).toContain("## Access logs");
    expect(text).toContain("ops/cloudflare.json");
    expect(text).toContain("templates/cloudflare/");
  });
});

describe("buildLlmsTxt hosting", () => {
  test("extraSections に hosting をマージ", () => {
    const txt = buildLlmsTxt({
      siteTitle: "Gov",
      siteDescription: "d",
      baseUrl: "https://www.example.go.jp",
      extraSections: [llmsHostingSection(hostingSite, "https://www.example.go.jp").join("\n")],
    });
    expect(txt).toContain("## Access logs");
  });
});

describe("runBuild cloudflare ops", () => {
  test("ops/cloudflare.json を dist に書く", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sorane-cf-ops-"));
    const contentDir = join(tmp, "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "about.md"),
      "---\ntitle: About\ntype: article\ntimestamp: 2025-06-01T00:00:00Z\nprofile: sorane-okf/0.1\n---\n\nBody\n",
    );

    try {
      await runBuild({
        cwd: tmp,
        config: mergeConfig({
          site: hostingSite,
          build: {
            content_dir: "content",
            out_dir: join(tmp, "dist"),
            permalink: "{{slug}}.html",
            outputs: { llms_txt: true },
          },
        } as Partial<SoraneConfig>),
        clean: true,
      });

      const opsPath = join(tmp, "dist/ops/cloudflare.json");
      expect(existsSync(opsPath)).toBe(true);
      const ops = JSON.parse(readFileSync(opsPath, "utf8")) as { provider: string };
      expect(ops.provider).toBe("cloudflare");

      const llms = readFileSync(join(tmp, "dist/llms.txt"), "utf8");
      expect(llms).toContain("## Access logs");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});