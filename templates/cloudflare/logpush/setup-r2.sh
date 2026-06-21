#!/usr/bin/env bash
# Enable Cloudflare Logpush (http_requests) → R2 for a sorane site zone.
# Requires: curl, jq, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, ZONE_ID,
#           R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
set -euo pipefail

API="https://api.cloudflare.com/client/v4"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIELDS_FILE="${SCRIPT_DIR}/fields.json"

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
: "${ZONE_ID:?Set ZONE_ID (Cloudflare zone for your custom domain)}"
: "${R2_BUCKET:?Set R2_BUCKET (destination bucket name)}"
: "${R2_ACCESS_KEY_ID:?Set R2_ACCESS_KEY_ID (R2 API token Access Key ID)}"
: "${R2_SECRET_ACCESS_KEY:?Set R2_SECRET_ACCESS_KEY (R2 API token Secret Access Key)}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

FIELDS="$(jq -c . "$FIELDS_FILE")"
JOB_NAME="${LOGPUSH_JOB_NAME:-sorane-http-requests-r2}"
R2_PATH_PREFIX="${R2_PATH_PREFIX:-access-logs}"

# CF R2 Logpush destination_conf (see developers.cloudflare.com/logs/.../r2/)
DEST_CONF="r2://${R2_BUCKET}/${R2_PATH_PREFIX}/{DATE}?account-id=${CLOUDFLARE_ACCOUNT_ID}&access-key-id=${R2_ACCESS_KEY_ID}&secret-access-key=${R2_SECRET_ACCESS_KEY}"

echo "Creating Logpush job '${JOB_NAME}' (zone ${ZONE_ID} → R2 ${R2_BUCKET}/${R2_PATH_PREFIX}/{DATE})..."

RESP="$(curl -sS -X POST "${API}/zones/${ZONE_ID}/logpush/jobs" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg name "$JOB_NAME" \
    --arg dest "$DEST_CONF" \
    --argjson fields "$FIELDS" \
    '{
      name: $name,
      dataset: "http_requests",
      enabled: true,
      output_options: {
        field_names: $fields,
        timestamp_format: "rfc3339",
        sample_rate: 1
      },
      destination_conf: $dest
    }')")"

if echo "$RESP" | jq -e '.success == true' >/dev/null; then
  echo "Logpush job created:"
  echo "$RESP" | jq '.result | {id, dataset, enabled, destination_conf}'
else
  echo "Logpush API error:" >&2
  echo "$RESP" | jq '.' >&2
  exit 1
fi