import type { SoraneConfig } from "./config.ts";

export const CLOUDFLARE_OPS_SCHEMA_VERSION = 1 as const;

export interface SiteHostingLogpushConfig {
  /** Logpush dataset（既定: `http_requests`） */
  readonly dataset?: string;
  readonly destination?: "r2" | "s3" | "https";
  readonly r2_bucket?: string;
  /** 監査集計から除外するパス接頭辞（例: `/assets/`） */
  readonly exclude_paths?: readonly string[];
}

export interface SiteHostingCloudflareConfig {
  readonly pages_project?: string;
  /** Logpush 用ゾーン名（カスタムドメインを Cloudflare でプロキシしているホスト） */
  readonly zone_name?: string;
  readonly logpush?: SiteHostingLogpushConfig;
  /** Cloudflare ダッシュボードで Web Analytics を有効化する（HTML 埋め込みなし） */
  readonly web_analytics?: boolean;
}

export interface SiteHostingConfig {
  readonly provider?: "cloudflare";
  readonly cloudflare?: SiteHostingCloudflareConfig;
}

/** Logpush `http_requests` で公的監査に使いやすいフィールド。 */
export const RECOMMENDED_LOGPUSH_FIELDS = [
  "EdgeStartTimestamp",
  "RayID",
  "ClientIP",
  "ClientCountry",
  "ClientRequestHost",
  "ClientRequestMethod",
  "ClientRequestPath",
  "ClientRequestURI",
  "ClientRequestUserAgent",
  "EdgeResponseStatus",
  "CacheCacheStatus",
] as const;

export interface CloudflareOpsManifest {
  readonly schema_version: typeof CLOUDFLARE_OPS_SCHEMA_VERSION;
  readonly provider: "cloudflare";
  readonly site_title: string;
  readonly base_url: string;
  readonly pages_project?: string;
  readonly zone_name?: string;
  readonly web_analytics?: boolean;
  readonly logpush?: {
    readonly dataset: string;
    readonly destination?: string;
    readonly r2_bucket?: string;
    readonly exclude_paths: readonly string[];
    readonly recommended_fields: readonly string[];
  };
  readonly stack_template: string;
  readonly notes: readonly string[];
}

export function cloudflareHostingFromSite(
  site: SoraneConfig["site"],
): SiteHostingCloudflareConfig | undefined {
  if (site.hosting?.provider !== "cloudflare") return undefined;
  return site.hosting.cloudflare;
}

export function isCloudflareHostingEnabled(site: SoraneConfig["site"]): boolean {
  return site.hosting?.provider === "cloudflare";
}

function defaultExcludePaths(site: SoraneConfig["site"]): string[] {
  const fromLogpush = site.hosting?.cloudflare?.logpush?.exclude_paths ?? [];
  const fromFindability = site.findability?.disallow ?? [];
  const merged = [...fromLogpush, ...fromFindability];
  return [...new Set(merged.map((p) => (p.startsWith("/") ? p : `/${p}`)))];
}

/** `dist/ops/cloudflare.json` — Logpush 連携用メタデータ（ランタイム JS なし）。 */
export function buildCloudflareOpsManifest(
  site: SoraneConfig["site"],
  stackTemplatePath = "templates/cloudflare",
): CloudflareOpsManifest | undefined {
  if (!isCloudflareHostingEnabled(site)) return undefined;
  const cf = site.hosting!.cloudflare ?? {};
  const logpush = cf.logpush;
  const notes = [
    "Access logs are collected via Cloudflare zone Logpush (http_requests), not sorane HTML.",
    "Enable Logpush after the custom domain is active on Cloudflare.",
    "See templates/cloudflare/README.md for R2 destination and API setup.",
  ];
  if (cf.web_analytics) {
    notes.push(
      "Web Analytics: enable in Cloudflare dashboard (no sorane-embedded beacon).",
    );
  }
  return {
    schema_version: CLOUDFLARE_OPS_SCHEMA_VERSION,
    provider: "cloudflare",
    site_title: site.title,
    base_url: site.base_url,
    pages_project: cf.pages_project,
    zone_name: cf.zone_name,
    web_analytics: cf.web_analytics,
    logpush: {
      dataset: logpush?.dataset ?? "http_requests",
      destination: logpush?.destination,
      r2_bucket: logpush?.r2_bucket,
      exclude_paths: defaultExcludePaths(site),
      recommended_fields: [...RECOMMENDED_LOGPUSH_FIELDS],
    },
    stack_template: stackTemplatePath,
    notes,
  };
}

/** `llms.txt` 向けアクセスログ節。 */
export function llmsHostingSection(
  site: SoraneConfig["site"],
  baseUrl: string,
): string[] {
  if (!isCloudflareHostingEnabled(site)) return [];
  const abs = (u: string) =>
    /^https?:/.test(u) || baseUrl.length === 0 ? u : `${baseUrl.replace(/\/$/, "")}/${u}`;
  const cf = site.hosting!.cloudflare;
  const lines = [
    "",
    "## Access logs",
    "",
    "HTTP access logs are collected at the Cloudflare zone (Logpush `http_requests`), not embedded in page HTML.",
    `- [Ops manifest](${abs("ops/cloudflare.json")})`,
    "- Stack template: `templates/cloudflare/` (Logpush → R2, optional Web Analytics in dashboard)",
  ];
  if (cf?.pages_project) {
    lines.push(`- Cloudflare Pages project: \`${cf.pages_project}\``);
  }
  if (cf?.zone_name) {
    lines.push(`- Logpush zone: \`${cf.zone_name}\``);
  }
  if (cf?.logpush?.r2_bucket) {
    lines.push(`- Log archive (R2): \`${cf.logpush.r2_bucket}\``);
  }
  return lines;
}