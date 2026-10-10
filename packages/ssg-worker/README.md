# Artifacts-backed sorane builds

The three private Workers work without GitHub:

1. A Mikaki-authenticated editor submits the configured repository's 40-character
   commit SHA to the [management Worker](../admin-worker/README.md), or an
   explicitly configured Artifacts push subscription submits it automatically.
2. D1 records the audited proposal and build job together. A Queue consumer reads
   that immutable Artifacts commit and verifies its Git tree/blob hashes.
3. The actual sorane validator and engine build in a request-scoped Workers VFS.
   Repository files are data; repository scripts, dependencies and Git hooks are
   never executed. Ajv profile validators are compiled when bundling the Worker.
4. R2 holds SHA-256-addressed files and a final manifest. Only a complete upload
   gets an immutable `ready` receipt. The manifest binds the repository ID, commit,
   tree, engine, policy, public base URL and every output file's digest/size/type.
5. Members can preview the candidate through the isolated public Worker. A fresh
   Mikaki status check issues a ticket valid for at most 60 seconds. Expiry,
   local/back-channel logout and membership removal invalidate the ticket.
6. A publisher/owner approves the exact candidate. One D1 transaction records the
   audit and switches the public pointer. The public Worker reads the existing
   R2 files and verifies their hashes; publication does not rebuild them.

Only the admin Worker receives `RP_PRIVATE_JWK`. The builder has Artifacts,
Queues, D1 and R2 bindings; the public Worker has D1 and R2. Neither receives
human session cookies, a Cloudflare API token or Git tokens. Preview content and
static JavaScript execute on an origin separate from the management API.
No CORS grants access to the admin API.

## Workers content profile

The initial `sorane-workers-content-v1` profile supports OKF 0.1/0.2/0.3 Markdown,
the standard renderer, static assets, Markdown alternates and the usual feed,
sitemap, robots, catalog and text outputs. Sources need a valid content directory
and an index that produces `index.html`. The public address is
`PUBLIC_ORIGIN/:siteId/`; the engine overrides a repository's `site.base_url`.

Native Mermaid compilation, font subsetting, C2PA, image metadata tools, OKFC,
SQLite/search pages, and redirect rules require another build profile and are
rejected here. This Worker never falls back to silently publishing a reduced
build. `build.out_dir` must be `dist` and permalink must be `{{slug}}.html`.
Content/static directories and explicit slugs must be confined relative paths.
Raw embeds and unsafe link schemes are rejected. The public Worker applies its
own CSP and does not serve generated `_headers`/`_redirects` as files.

| Bound | Limit |
| --- | --- |
| Source | 128 files, 256 KiB/file, 4 MiB total |
| Git tree | 256 total entries, 16 directory levels |
| Output | 256 files, 1 MiB/file, 8 MiB total |
| Build claim | 120-second lease; duplicate messages cannot replace a ready receipt |
| Validation report | 128 KiB; larger reports are summarized with `truncated: true` |
| Preview | 60 seconds or the remaining session lease, whichever is shorter |

Symlinks, submodules, `.git` paths, traversal and hash mismatches fail closed.
Transient Artifacts/R2 errors retry; deterministic input failures stop. A failed
proposal can be retried by submitting a new proposal with a new operation ID.
Missed Queue sends and expired build claims are recovered by the admin's cron
outbox, currently every ten minutes. There is no R2 garbage collector yet;
unreferenced partial/old builds remain private and can accumulate storage.

## Verify

```sh
npm install
npm run workers:types
npm run typecheck
npm run workers:check
npm run admin:test
npm run ssg:test
npm run workers:build
```

Tests use the real Workers runtime, D1, Queues and R2, plus synthetic ES256 OIDC
and Artifacts RPC providers. They exercise actual HTML generation, all three
precompiled OKF schemas, preview/public reads, digest/engine approval, revocation,
filesystem confinement, invalid/oversized source and corrupt stored objects.
The builder's test denies outbound HTTP. These checks do not establish that a
production Artifacts service or Mikaki RP has been connected.

## Prepare a deployed environment

Use a dedicated environment: three new Workers, one D1 database, one private R2
bucket, one Queue, an Artifacts namespace/repository, and separate HTTPS admin
and public origins. The checked-in configs have placeholder identity/resources,
local development bindings and disabled workers.dev/version-preview URLs.
`remote: false` controls local simulation; deployed Workers use real resources.

Verify the account and resource identities before provisioning or deploying.
Artifacts REST provisioning needs an account-scoped token with
[Artifacts Read and Edit](https://developers.cloudflare.com/artifacts/get-started/rest-api/#prerequisites).
Workers/D1/R2/Queues and the custom domains also need the corresponding deployment
permissions. Keep the operator token in the environment, never in Worker vars
or repository files. The current operator token returns HTTP 401/code 10000 for
Artifacts REST namespaces, but the official remote Workers binding successfully
created and read the isolated repository. REST provisioning and Workers binding
access must be checked separately. The [development deployment record](../../docs/artifacts-mikaki-development.md)
records the actual connected resources and deployed qualification.

Provision the isolated resources with the project-local Wrangler and record
their actual names/UUIDs. Prepare the Mikaki RP public key, exact callback and
back-channel URL as described in the [management runbook](../admin-worker/README.md#connect-a-registered-mikaki-rp).
Then generate matching, reviewable configs:

```sh
npm run workers:configure -- \
  --account YOUR-ACCOUNT-ID \
  --database-id YOUR-PROVISIONED-D1-UUID --database-name sorane-dev-admin \
  --namespace sorane-dev --bucket sorane-builds-dev --queue sorane-build-jobs-dev \
  --admin-origin https://YOUR-ADMIN-HOST --public-origin https://YOUR-PUBLIC-HOST \
  --client YOUR-REGISTERED-RP-CLIENT-ID --prefix sorane-dev
```

This builds the trusted engine and writes `.sorane/workers/{admin,ssg,public}.jsonc`
and `plan.json`, all ignored by Git. It writes no keys, registers no RP and makes
no remote changes. The admin config's `EXPECTED_ENGINE` matches the bundled
builder. For workers.dev, add `--workers-subdomain YOUR-ACCOUNT-SUBDOMAIN` and use
the exact origins `https://PREFIX-admin.SUBDOMAIN.workers.dev` and
`https://PREFIX-public.SUBDOMAIN.workers.dev`. The generator checks the hostnames
against the Worker prefix and enables workers.dev only for admin/public; the
builder has no public URL. Without that option it configures custom domains.
Review the plan and dry-run each config before deployment:

```sh
npx wrangler deploy --dry-run --config .sorane/workers/admin.jsonc
npx wrangler deploy --dry-run --config .sorane/workers/ssg.jsonc
npx wrangler deploy --dry-run --config .sorane/workers/public.jsonc
```

Apply all three D1 migrations using the generated admin config and the intended
`--remote` target. Generate/apply the identity pin from the management runbook.
Store `RP_PRIVATE_JWK` through Wrangler's protected secret input; it is not part
of the plan. A protected JSON file `{ "RP_PRIVATE_JWK": "PRIVATE-JWK-JSON" }` can
also be supplied through `wrangler deploy --secrets-file FILE`, uploading code
and the encrypted secret in the same deployment. Keep that file ignored and
mode 0600. Deploy the three generated configs to the verified account. After
a real Mikaki login, bootstrap the first site owner using that RP's exact
pairwise subject and the configured namespace/repository. Do not reuse a subject
from another client. Submit an actual Artifacts commit, inspect its preview,
approve the returned candidate digest and confirm the public response's
`X-Sorane-Candidate` header.

Regenerate the plan after engine/dependency changes. Existing ready candidates
remain immutable; candidates built by an older fingerprint cannot receive a new
approval. Existing published files remain readable.

## Manuscript draft builds

Human-authenticated [manuscript drafts](../admin-worker/README.md#manuscript-drafts)
use the same Queue pipeline. The builder first verifies the pinned base Git
source, then applies retained Markdown changes after repository/path/before-hash
checks. The manifest binds the draft digest in addition to the base commit/tree.
Missing or corrupted draft data cannot fall back to an unmodified build. This
path performs no inference, Git writes or workload-token issuance; the usual
isolated preview and exact human publication approval apply.

## Build on Artifacts push

Push ingestion is opt-in and configured by the operator. It creates a proposal
and build, and cannot approve or publish it. There is no HTTP event endpoint.
The Worker accepts events only on `BUILD_QUEUE_NAME`, with an exact account,
subscription ID, namespace, repository name and branch. A fresh Artifacts read
checks the pinned repository ID and commit; the builder repeats the ID check.
Deletion, other branches/sources, old events and unsupported schemas are ignored.

Create a repository-scoped subscription using the installed Wrangler:

```sh
npx wrangler queues subscription create sorane-build-jobs-dev \
  --source artifacts.repo --events pushed --name sorane-dev-content-push \
  --source-namespace sorane-dev --source-repo-name content \
  --config .sorane/workers/admin.jsonc
```

Record the returned subscription ID and independently verified repository ID in
a local JSON file, then add `--push-sources PATH` to `workers:configure`:

```json
[
  {
    "site": "demo",
    "repository": "content",
    "repositoryId": "YOUR-VERIFIED-REPOSITORY-ID",
    "ref": "refs/heads/main",
    "accountId": "YOUR-32-HEX-ACCOUNT-ID",
    "subscriptionId": "YOUR-32-HEX-SUBSCRIPTION-ID",
    "enabledAt": 1791593640
  }
]
```

Use the activation time as Unix seconds. The file is configuration, not a bearer
credential. At most ten distinct site/source routes are supported; ambiguous
routes are rejected. Omission of `--push-sources` generates `[]`, disabling new
push admission. Preserve this option when regenerating an enabled environment.
To stop future automatic submissions, deploy `[]` or delete the named event
subscription. Already admitted proposals remain reviewable.

D1 records service provenance (`actor_kind=artifacts`), proposal, immutable push
receipt, job and revision in one batch. Duplicates of a site/repository/ref/commit
reuse that proposal, including after response loss. A receipt failure rolls back
all effects. The existing durable outbox recovers admitted jobs if dispatch stops
before the build. Repository write credentials are never minted by this path.

An AI agent's repository-write delegation remains separate. Human sessions are
not a workload identity; reuse Mikaki's scoped workload authority when its
issuer/launcher and release path are qualified.

References: [Artifacts Workers binding](https://developers.cloudflare.com/artifacts/api/workers-binding/),
[Artifacts events](https://developers.cloudflare.com/artifacts/guides/event-subscriptions/),
[Manage subscriptions](https://developers.cloudflare.com/queues/event-subscriptions/manage-event-subscriptions/),
[Workers VFS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
