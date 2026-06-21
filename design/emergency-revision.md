# Emergency banner + revision history (Phase 4)

Public-sector site operations: site-wide alerts and per-page update logs.

## Emergency banner

Configured in `sorane.yaml`. Shown on **every page** above the site header (`role="alert"`).

```yaml
site:
  emergency:
    message: ただいまメンテナンス中です。復旧までお待ちください。
    severity: warning   # info | warning | emergency（既定: warning）
    href: https://status.example.go.jp/
    link_text: 状況ページ
    locales:
      en:
        message: Scheduled maintenance in progress.
        severity: warning
        href: https://status.example.go.jp/en
        link_text: Status page
```

- Omit `message` (or leave empty) to disable the banner.
- `locales` keys match `site.i18n.locales` IDs (e.g. `en`).
- Default-locale pages use the top-level `message`; locale-prefixed pages use `locales.{id}` when present.

## Revision history

Optional frontmatter on any content page:

```yaml
revisions:
  - date: 2025-06-15
    summary: 誤字を修正
  - date: 2025-06-01
    summary: 初版公開
```

- Rendered as an accessible table below the article body (newest first).
- `note` is accepted as an alias for `summary`.
- `updated` is accepted as an alias for `date` on each row.

### validate --json

| category | Rule |
|----------|------|
| `revision` | `revisions` must be an array; rows need date + summary; dates parseable; newest-first order |

## Roadmap

See [findability-pack.md](./findability-pack.md):

5. **Access logs** — see [access-logs.md](./access-logs.md)