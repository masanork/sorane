# Artifacts / Mikaki development environment

Connected on 2026-10-09 (JST). This is a dedicated `sorane-dev` environment.
Mikaki authenticates users with the existing production OP; sorane uses a new
RP, signing key and database. Existing Mikaki clients and OP keys were unchanged.

| Resource | Identity |
| --- | --- |
| Cloudflare account | `4b749427a0c80c547e726a42aff4b6fc` |
| Management | <https://sorane-dev-admin.masanork.workers.dev> |
| Public / preview | <https://sorane-dev-public.masanork.workers.dev> |
| Builder | `sorane-dev-ssg`, Queue consumer, no public URL |
| D1 | `sorane-dev-admin`, `6e04a936-322a-4222-ac2b-dc83ec4c8d25` |
| R2 | `sorane-builds-dev`, private |
| Queue | `sorane-build-jobs-dev`, `1b17ce034f7f4cd7be7dc951d8cd95c2` |
| Artifacts | Namespace `sorane-dev`, repository `content`, ID `ryy6r2arl7mrslik` |
| Mikaki issuer | `https://auth.mikaki.org` |
| Mikaki client | `2d311868-996f-4fbb-9ea1-8319028d33aa` |
| RP key ID | `sorane-dev-20261009` (ES256 public key registered) |

Callback is the exact management origin plus `/callback`; signed back-channel
logout is registered at `/backchannel`. The D1 `admin_instance` identity pin
matches this issuer, client and origin. The first two D1 migrations were applied
on October 9; the additive push and manuscript draft migrations were applied on October 10.
The unrelated `0005_contact.sql` also entered the migration command during
concurrent workspace edits; its additional tables remain. Contact/inquiry code
was excluded from this deployment, and no inquiry data was created.
Only the management Worker has `RP_PRIVATE_JWK`, uploaded as an encrypted secret.
Workers version preview URLs and invocation/trace logging remain disabled.

## Qualification completed

- All three actual resource configs passed Wrangler deployment dry runs, then
  deployed successfully. Current version IDs: admin `f75b22ae-61b6-4126-a17b-dd5041537cb7`,
  builder `00d2e712-1ee5-4f66-810a-12481077ba0c`, public
  `2470840d-471d-4d45-bf83-582b8d996686`.
- Management home returned 200, unauthenticated sites API returned 401, and the
  login form redirected to Mikaki with the registered callback, state, nonce and
  PKCE S256. The user completed a real Passkey login; the RP's actual pairwise
  subject was verified and explicitly bootstrapped as the first owner of `demo`.
- When that OP parent/app session was subsequently revoked, a browser proposal
  submission was rejected with `session_inactive` (401). D1 confirmed no proposal,
  build job or publication was admitted and the site revision remained 1. Account,
  credential, RP and app-connection validity were unchanged. Browser form 401s now
  provide a Japanese sign-in recovery page; JSON APIs retain their 401 responses.
- The public Worker returned 404 for `demo` before approval, including after the
  remote build completed.
- A public, synthetic sample was pushed to the new Artifacts repository without
  GitHub. Commit `a0de0cbfdf56d8494278d544038b77e5fc68d8b8`, tree
  `a5c83d2b9e431468609b737dfcf27de203702a9c`. The initial Git write token was
  explicitly revoked after verifying the remote commit/blob hashes.
- The actual builder source read that remote commit through the official
  Artifacts binding in a local Workers runtime, validated it, and generated
  nine files (9,511 bytes) into local R2. Errors: zero; warnings: four concerning
  headings/language markup. This preliminary local qualification created no
  remote publication pointer.
- After the user signed in again, the browser submitted the sample commit under
  the actual owner's managed Mikaki session. The deployed Queue consumer read
  the remote Artifacts commit and generated the same nine files (9,511 bytes)
  in remote R2, with zero validation errors and four warnings. Its candidate
  digest matched the preliminary local build.
- The browser displayed the isolated preview. HTML preview forms now return a
  same-origin page with a normal preview link, avoiding a cross-origin form
  redirect without expanding the management CSP's `form-action` destinations.
  Reloading the expired preview subsequently displayed `Not found`.
- The owner form approved that exact candidate. The site advanced to revision 3,
  with both submission and approval audited. The public pointer references the
  existing ready receipt; approval caused no rebuild.
- [The published sample](https://sorane-dev-public.masanork.workers.dev/demo/)
  returned 200 for GET and HEAD. All eight served files matched their R2 manifest
  sizes and SHA-256 hashes; `_headers`, the ninth generated file, returned 404 as
  intended. Every served file carried the approved `X-Sorane-Candidate`.
- A deployed check exposed weak ETags after Cloudflare compression. The public
  Worker now handles weak comparison, tag lists and `*` for GET/HEAD, following
  [RFC 9110 §13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2).
  Revalidation using the actual response ETag returned 304. See also
  [Cloudflare's ETag behavior](https://developers.cloudflare.com/cache/reference/etag-headers/).
- The local pipeline suite passed 640 tests with coverage thresholds met.
  TypeScript and all Worker checks passed; audit had no high-severity findings.
  After the browser recovery change, all 16 management runtime tests and the
  management/project type checks passed, including revoked-form rejection without
  any audited effect. The later preview/ETag changes passed all seven pipeline
  runtime tests, management/public/project type checks, deployment dry runs and
  live verification. The full coverage suite was not rerun for those later fixes.

Current engine fingerprint at deployment:
`0eda7507ab0572bb9a637c66f1eb172be6ba7befc92d2e08cf4ab218d1775c03`.
The generated admin config pins this same fingerprint.

The current operator token still returns 401/code 10000 for the Artifacts REST
namespace API. The documented [Workers binding](https://developers.cloudflare.com/artifacts/api/workers-binding/)
was separately verified and used successfully for this new namespace/repository.
No public token-issuing Worker was deployed.

## Published receipt

| Field | Value |
| --- | --- |
| Site / revision at publication | `demo` / `3` |
| Proposal | `af8dabc8-24dc-42a6-acae-00803011de7e` |
| Approval | `1e95ba66-8c0c-40ff-9f75-f81b4d0f672c` |
| Candidate SHA-256 | `fafaadd7a7a6e932d09f3e6eb54369493bf93895fb9365757ed3785719f93e04` |
| Publication engine | `ea038a2c5f7a120b55147e8ab0bcfaaa273149df059e3deb9d6ca451556b770f` |
| Publication | <https://sorane-dev-public.masanork.workers.dev/demo/> |

The deployed human flow is qualified: real Passkey authentication, site-scoped
authorization, proposal admission, Artifacts read, Queue build, R2 storage,
temporary preview and exact-candidate publication. Session revocation rejection
was verified before re-login; logout tokens and preview revocation races are also
covered by local runtime tests. No new global logout was performed after publishing.
The first owner is already registered; do not repeat its bootstrap. For another
site, see the [bootstrap runbook](../packages/admin-worker/README.md#connect-a-registered-mikaki-rp).

## Push qualification on October 10

The repository-scoped [Artifacts event subscription](https://developers.cloudflare.com/artifacts/guides/event-subscriptions/)
`5897e37322a244739e50d9f54df75cba` sends `pushed` events for `sorane-dev/content`
to the existing build Queue. The builder's operator configuration pins this
account, subscription, namespace, repository ID, `refs/heads/main` and activation
time. There is no public webhook or Git credential in the builder.

A short-lived operator Git token pushed one synthetic change to `static/note.txt`.
The remote branch was read back and that token explicitly revoked. The real
subscription automatically created the audited service proposal and built it:

| Field | Value |
| --- | --- |
| Commit | `622a49700ce01c9bbd6c7259fa99f3dde2c2c524` |
| Tree | `96a3eecf54c23ebd17e4e7f1113e8c9f5680d724` |
| Proposal | `f1d937d9-3a7e-65d1-3c03-0382b8388f86` |
| Service audit | `actor_kind=artifacts`, `proposal.submit`, revision 3 → 4 |
| Build engine | `1c663abb97e1bc70dc8d362c1a58e5819e4428e7d88739fd1ef45fdf18b28c6f` |
| Candidate | `25298389f2765cdcf9f509157dc9935652393888a2152ec3b4c37c106348b06a` |
| Result | `ready`, 9 files / 9,566 bytes, 0 errors / 4 markup warnings |
| Publication | Existing approved candidate remains active; new proposal is `submitted` |

The downloaded remote R2 manifest hash, repository, commit, tree, engine and
file totals matched the D1 receipt. The changed 94-byte object also matched its
manifest SHA-256 and local Git source bytes. Public GET/HEAD remained 200 and revalidation
304; all eight served file hashes still matched the previously approved manifest.
The sample modification is private until its exact candidate is approved.

All 11 pipeline and 16 management runtime tests passed. They include real Queue
delivery, duplicate/concurrent push admission, exact source/ref/subscription
filters, atomic rollback and service refusal for approval actions. Worker/project
type checks and both affected deployment dry runs passed. The full repository
coverage suite was not rerun in this increment. Human API authentication remains
the unchanged Mikaki adapter.

## Manuscript draft qualification on October 10

The [manuscript draft API](../packages/admin-worker/README.md#manuscript-drafts)
accepts bounded Markdown replacements/additions/deletions over a pinned Artifacts
base commit. It uses the existing fresh human Mikaki session, site roles, CSRF
and atomic audited proposal transaction. It introduces no workload issuer/grant
ledger and releases no Git credential. AI inference is not performed by this API.

The actual browser owner submitted one synthetic replacement for
`content/hello.md`. The member-only review page displayed the retained original
Markdown safely, the deployed Queue built it, and the isolated browser preview
showed the added Japanese qualification paragraph.

| Field | Value |
| --- | --- |
| Base commit | `622a49700ce01c9bbd6c7259fa99f3dde2c2c524` |
| Base tree | `96a3eecf54c23ebd17e4e7f1113e8c9f5680d724` |
| Repository | `ryy6r2arl7mrslik` |
| Proposal | `2bfd3f7d-9397-4447-9ae3-933f8798ae97` |
| Draft SHA-256 | `81acc15f73f4fc2c72eea812524d35c36706a0de453804369f68715d5faba392` |
| Audit | `actor_kind=human`, `proposal.submit`, revision 4 → 5 |
| Candidate | `c19b804c19307ed034769bc4829a0ec04e1d08b981355d3f6877d154705870e1` |
| Engine | `829ed434b8fc3dd25f2bf7d16fc35138f850f980b668828f06acf038f834e765` |
| Result | `ready`, 9 files / 9,872 bytes, 0 errors / 4 markup warnings |
| Publication | Original approved candidate remains active; draft is `submitted` |

The draft changes exist in retained D1 data and the content-addressed R2 output.
The Git commit/tree remain the base source; there is no Git write or new Git
commit. Publishing the draft later serves these retained files. A subsequent
Git-only build will need separate Git adoption to include its text.

The downloaded remote manifest SHA-256 matched the candidate receipt; its draft
digest matched the canonical submitted changes, and its base repository/commit/
tree, engine, nine files and 9,872 bytes matched D1. Public GET/HEAD remained 200,
conditional GET 304, with all eight served hashes matching the original approved
manifest. The new draft was not approved or published in this qualification.
The downloaded 3,226-byte `hello.html` matched its manifest SHA-256 and contained
the added paragraph. The protected receipt is `.sorane/operator/draft-verified.json`.

All 21 management and 15 pipeline runtime tests passed, including closed/bounded
input, role/session revocation, concurrent canonical retry, audit/storage rollback,
Markdown replacement/addition/deletion, repository/path/before-hash checks,
missing/corrupted draft rejection and exact human approval without rebuild.
The local CLI qualification verifies selected base blobs and refuses symlinks
without committing or sending. Worker/project type checks and all three deployment
dry runs passed. The full repository coverage suite was not rerun.

Concurrent contact/inquiry edits appeared while applying migrations. The qualified
snapshot `.sorane/qualified/drafts-20261010/` excludes that source and preserves the
root working tree. Its 36 runtime tests, all Worker type checks and all three dry
runs passed again before deployment. Protected source hashes are retained in
`.sorane/operator/draft-source-verified.json`; the three version IDs above were
deployed from that snapshot. This result does not qualify the concurrent inquiry
implementation. Its empty additive tables were not removed.

The earlier push-created candidate uses an older engine fingerprint. It can still
be previewed, but this management version requires a fresh proposal/build under
the current engine before it can be published. Previously published files continue
to be served.

## Article editor qualification on October 10

The management UI now separates **記事**, **確認・公開**, and **設定**. Article
search, new article creation and the title/body editor replace commit and JSON
entry in the ordinary writing flow. Settings retain owner-only permissions and
advanced commit import. Technical candidate details are collapsed in the review
screen. Preview buttons open the isolated preview directly.

Admin reads immutable content through a private `CONTENT_SOURCE` service binding
to the builder's named `ContentSource` entrypoint. The builder's public default
fetch remains 404; admin verifies site membership before source reads. Edits are
overlaid on the selected proposal, preserve other retained article changes and
OKF metadata, and enter the existing fresh Mikaki check/atomic audit/outbox path.
Saving does not update Git or publish a candidate. Older-engine candidates can
be explicitly rebuilt in the review screen before publication.

The isolated deployment source is `.sorane/qualified/editor-20261010/`. It starts
from the prior qualified draft source, adds the editor and read-only service, and
excludes concurrent contact code, its navigation and new migrations. No migration
or identity/bootstrap operation was applied. The bundle now resolves OKF sources
inside the isolated checkout while sharing installed third-party dependencies.
The active configs pin this snapshot and the current engine above.

All 37 scoped runtime tests passed with Worker/project type checks and admin/
builder deployment dry runs. The real signed-in owner opened the existing retained
draft, edited `content/hello.md`, saved through the editor and opened its generated
preview with one click. The earlier draft paragraph and the new editor paragraph
both appeared. Browser checks covered search, no-change feedback, unsaved state,
and the list/editor at 390px without horizontal overflow. The viewport was reset.

| Field | Value |
| --- | --- |
| Site revision after save | `6` |
| Editor proposal | `ef25e875-ccac-409d-a210-1f29d1930441` |
| Base commit | `622a49700ce01c9bbd6c7259fa99f3dde2c2c524` |
| Draft digest | `a5b840dbd5fb33f3131245f7ab8e6cca5b160129d392c39c5bee7e93b146f564` |
| Candidate | `2e6645ee4f4425f54f85901133ba55c26a210411f2778a728341ffb6ba6e03af` |
| Output | 9 files / 10,175 bytes; no validation errors |
| State | `submitted`, preview ready; publication remains the original approved candidate |

The downloaded R2 manifest and article bytes matched their SHA-256 receipts and
D1 provenance; the canonical draft and original before hash matched as well.
Public GET/HEAD still returned 200 and conditional GET returned 304; all eight
served files matched the existing approved manifest. Protected receipts are
`.sorane/operator/editor-verified.json` and `editor-source-verified.json` (160
source inputs). Screenshots are `/private/tmp/sorane-editor-ui.jpg` and
`/private/tmp/sorane-editor-mobile.jpg`.

## Operator state and redeployment

Local active configs/plan are under `.sorane/workers/` and point to the qualified
snapshot. Operator receipts and
the private RP key backup are under `.sorane/operator/`. These directories are
ignored. The operator directory is mode 0700; secret files are mode 0600. Keep the
key backup protected; it is never part of the repository or client registration.

To regenerate a plan from a selected, qualified source:

```sh
npm run workers:configure -- \
  --account 4b749427a0c80c547e726a42aff4b6fc \
  --database-id 6e04a936-322a-4222-ac2b-dc83ec4c8d25 \
  --database-name sorane-dev-admin \
  --namespace sorane-dev --bucket sorane-builds-dev --queue sorane-build-jobs-dev \
  --admin-origin https://sorane-dev-admin.masanork.workers.dev \
  --public-origin https://sorane-dev-public.masanork.workers.dev \
  --client 2d311868-996f-4fbb-9ea1-8319028d33aa \
  --prefix sorane-dev --workers-subdomain masanork \
  --push-sources .sorane/operator/push-sources.json
```

Recheck all three generated configs with `wrangler deploy --dry-run` before
redeploying them. Regeneration changes the pinned engine when engine sources or
dependencies change. Do not reapply the initial identity/site inserts or register
another RP/key merely to redeploy code. Existing resources and the RP are reused.
The current root workspace also contains concurrent inquiry work; qualify the
combined source before regenerating and deploying its broader feature set.

The operator-managed push configuration is in `.sorane/operator/push-sources.json`.
Preserve `--push-sources` when regenerating: omission generates `[]` and disables
new automatic submissions. See the [push runbook](../packages/ssg-worker/README.md#build-on-artifacts-push)
for the source schema and stop procedure. Deployment credentials remain operator
credentials; they are not delegated to an AI agent.

Push-triggered proposals/builds and human-authenticated manuscript draft
submission/preview are connected. Independent AI execution and repository-write delegation
is not connected; Mikaki's current issuer/launcher and workload release path
still needs qualification before attaching productive agent writes. Publication
continues to require explicit candidate approval by a Mikaki-authenticated
publisher or owner.
