import { escapeHtml } from "./render.ts";

export function isDraftFrontmatter(frontmatter: Record<string, unknown>): boolean {
  return frontmatter.draft === true;
}

export function previewSiteBannerHtml(lang: string): string {
  const message = lang.startsWith("ja")
    ? "ローカルプレビュー（未デプロイ）"
    : "Local preview (not deployed)";
  return (
    `<div class="preview-site-banner" role="status">` +
    `<p>${escapeHtml(message)}</p>` +
    `</div>\n`
  );
}

export function draftPageBannerHtml(lang: string): string {
  const message = lang.startsWith("ja")
    ? "下書き — 本番ビルドでは公開されません"
    : "Draft — excluded from production builds";
  return (
    `<div class="preview-draft-banner" role="status">` +
    `<p>${escapeHtml(message)}</p>` +
    `</div>\n`
  );
}