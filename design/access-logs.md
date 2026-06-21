# Access logs (Phase 5)

Cloudflare zone Logpush for sorane static sites — **no analytics JavaScript in HTML**.

## sorane hooks

### `sorane.yaml`

```yaml
site:
  hosting:
    provider: cloudflare
    cloudflare:
      pages_project: my-site
      zone_name: www.example.go.jp
      web_analytics: true   # enable in CF dashboard; not embedded by sorane
      logpush:
        destination: r2
        r2_bucket: my-site-access-logs
        exclude_paths:
          - /assets/search/lib/
```

### Build outputs

| File | Purpose |
|------|---------|
| `ops/cloudflare.json` | Operator/agent manifest (schema v1) |
| `llms.txt` § Access logs | Links to manifest + stack template path |

`exclude_paths` merges with `site.findability.disallow`.

## Stack template

Copy or reference `templates/cloudflare/`:

1. Create R2 bucket (`wrangler r2 bucket create` or `logpush/setup-r2.sh`)
2. Enable Logpush `http_requests` with `logpush/fields.json`
3. Optional: copy `static/_headers` into the site repo for security/cache headers

See [templates/cloudflare/README.md](../templates/cloudflare/README.md).

## Roadmap

Findability initiative complete after this phase. See [findability-pack.md](./findability-pack.md).