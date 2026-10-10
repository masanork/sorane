-- Pages publications are activated by the deployment operator, independently of
-- the Artifacts publication workflow. Preview hosts never receive a policy.
CREATE TABLE pages_contact_event (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id), origin TEXT NOT NULL,
  deployment_id TEXT NOT NULL, form_digest TEXT NOT NULL, policy_digest TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), actor TEXT NOT NULL,
  reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE pages_contact_publication (
  origin TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id),
  event_id TEXT NOT NULL REFERENCES pages_contact_event(id),
  deployment_id TEXT NOT NULL, form_digest TEXT NOT NULL, policy_digest TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), published_at INTEGER NOT NULL
);
