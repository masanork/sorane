# sorane public Worker

Serves the exact R2 candidate selected by an audited D1 publication pointer at
`PUBLIC_ORIGIN/:siteId/`. `/preview/:proposalId/:ticket/` serves a candidate only
while its short-lived ticket, RP session and site membership remain valid.
GET/HEAD only; manifests and file bytes are verified before responding.

Deploy this on an origin separate from the admin Worker. It has no Mikaki private
key or Artifacts binding. See the [pipeline runbook](../ssg-worker/README.md) for
shared configuration, supported build features and local verification.
