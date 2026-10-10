CREATE TABLE build_job (
  proposal_id TEXT PRIMARY KEY REFERENCES proposal(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','building','ready','failed')),
  attempt TEXT, lease_until INTEGER NOT NULL DEFAULT 0, enqueued_at INTEGER NOT NULL DEFAULT 0,
  repository_id TEXT, tree_hash TEXT, engine_id TEXT, candidate_digest TEXT,
  file_count INTEGER, total_bytes INTEGER, report TEXT, error TEXT, completed_at INTEGER
);
CREATE INDEX build_job_pending ON build_job(status,enqueued_at);
CREATE TRIGGER build_ready_immutable BEFORE UPDATE ON build_job WHEN OLD.status='ready'
BEGIN SELECT RAISE(ABORT, 'ready build is immutable'); END;
CREATE TRIGGER site_repository_immutable BEFORE UPDATE OF artifact_namespace,artifact_repository ON site
BEGIN SELECT RAISE(ABORT, 'site repository is immutable'); END;
ALTER TABLE publication_approval ADD COLUMN candidate_digest TEXT;
ALTER TABLE publication_approval ADD COLUMN tree_hash TEXT;
ALTER TABLE publication_approval ADD COLUMN engine_id TEXT;
CREATE TABLE site_publication (
  site_id TEXT PRIMARY KEY REFERENCES site(id),
  approval_id TEXT NOT NULL REFERENCES publication_approval(id),
  proposal_id TEXT NOT NULL REFERENCES proposal(id), candidate_digest TEXT NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE TABLE preview_ticket (
  token_hash TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES proposal(id),
  candidate_digest TEXT NOT NULL, session_hash TEXT NOT NULL REFERENCES rp_session(token_hash) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX preview_ticket_expiry ON preview_ticket(expires_at);
