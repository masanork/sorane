-- Inquiry data is private and never part of a build, publication, or search index.
CREATE TABLE contact_inquiry (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES site(id),
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','closed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  UNIQUE(site_id,request_id)
);
CREATE INDEX contact_inquiry_site ON contact_inquiry(site_id,created_at DESC,id DESC);
CREATE INDEX contact_inquiry_expiry ON contact_inquiry(expires_at);
-- The random hourly salt prevents a stored rate-limit key from identifying an IP.
CREATE TABLE contact_window (
  site_id TEXT NOT NULL REFERENCES site(id), hour INTEGER NOT NULL, salt TEXT NOT NULL,
  PRIMARY KEY(site_id,hour)
);
CREATE TABLE contact_attempt (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id), hour INTEGER NOT NULL,
  client_hash TEXT NOT NULL
);
CREATE INDEX contact_attempt_window ON contact_attempt(site_id,hour,client_hash);
CREATE TABLE contact_status_event (
  id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES contact_inquiry(id) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL
);
