# Cloudflare access logs stack (sorane)

Zone-level HTTP access logs for sorane sites on **Cloudflare Pages**. No analytics JavaScript is added to HTML — logging runs at the CDN edge via **Logpush**.

## Prerequisites

| Item | Notes |
|------|--------|
| Cloudflare account | Pages project already deploys `dist/` |
| Custom domain | Zone proxied through Cloudflare (orange cloud) |
| R2 bucket | Log archive destination (recommended) |
| API token | `Logs:Edit`, `Zone:Read`, `Account:Read`, `R2:Edit` |
| R2 API token | Access Key ID + Secret Access Key (`Edit` permission) for Logpush destination |

## 1. Enable sorane hosting hook

In `sorane.yaml`:

```yaml
site:
  base_url: https://www.example.go.jp/
  hosting:
    provider: cloudflare
    cloudflare:
      pages_project: my-site
      zone_name: www.example.go.jp
      web_analytics: true
      logpush:
        destination: r2
        r2_bucket: my-site-access-logs
        exclude_paths:
          - /assets/search/lib/
```

After `sorane build`, `dist/ops/cloudflare.json` documents the site for operators and agents (`llms.txt` links to it).

## 2. Create R2 bucket

```bash
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler r2 bucket create my-site-access-logs
```

Or use `logpush/setup-r2.sh` (see below).

## 3. Enable Logpush (`http_requests`)

Use the Cloudflare dashboard (**Analytics & Logs → Logpush**) or API:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export ZONE_ID=...          # zone for zone_name
export R2_BUCKET=my-site-access-logs
export R2_ACCESS_KEY_ID=...       # R2 → Manage R2 API Tokens
export R2_SECRET_ACCESS_KEY=...
./logpush/setup-r2.sh
```

Optional: `R2_PATH_PREFIX` (default `access-logs`) and `LOGPUSH_JOB_NAME` override the R2 path and job name.

The script creates an R2 Logpush job for dataset `http_requests` with fields from `logpush/fields.json` (aligned with `ops/cloudflare.json` `recommended_fields`).

## 4. Web Analytics (optional)

Enable **Web Analytics** in the Cloudflare dashboard for the zone. sorane does not inject a beacon; traffic is measured at the edge.

## 5. Verify

1. `curl -s https://www.example.go.jp/ops/cloudflare.json | jq .`
2. Generate test traffic, then confirm objects appear under the R2 bucket prefix (typically within minutes).
3. Exclude high-volume static paths via `logpush.exclude_paths` in `sorane.yaml` (merged with `site.findability.disallow`).

## Files

| Path | Purpose |
|------|---------|
| `logpush/fields.json` | Logpush field list for `http_requests` |
| `logpush/setup-r2.sh` | Create R2 destination + Logpush job |
| `static/_headers` | Optional security headers (copy to site `static/_headers`) |
| `wrangler.jsonc` | Reference wrangler config (R2 bucket management) |

## CI

Site deploy stays in `template/site/.github/workflows/pages.yml`. Logpush is a **one-time zone setup**, not per-deploy. Re-run `setup-r2.sh` only when rotating destinations or fields.