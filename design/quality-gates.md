# Public quality gates (Phase 2)

`validate --json` warnings for accessibility and content hygiene. Build continues; CI may gate on `ok` (errors only).

## Categories

| category | Rule |
|----------|------|
| `image` | Inline `![alt](url)` must have non-empty alt |
| `link` | Avoid generic anchors (`こちら`, `here`, `click here`, …); `#` anchors exempt |
| `table` | GFM tables need `\| --- \|` separator; header cells non-empty |
| `date` | `timestamp` / `updated` parseable; `updated` ≥ `timestamp` |
| `diagram` | (existing) diagram fence alt |
| `heading` | (existing) heading hierarchy |

## Configuration

```yaml
build:
  quality:
    image_alt: true
    link_text: true
    table_headers: true
    dates: true
```

## Roadmap

1. Findability pack — done
2. **Quality gates** — this doc
3. Multilingual / hreflang — see [i18n.md](./i18n.md)
4. Emergency banner + revision history — see [emergency-revision.md](./emergency-revision.md)
5. Access logs — Cloudflare templates