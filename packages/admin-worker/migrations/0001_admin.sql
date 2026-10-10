-- Authentication tables consumed by the unchanged Mikaki RP adapter.
CREATE TABLE login_transaction (
  state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL,
  verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE rp_session (
  token_hash TEXT PRIMARY KEY, sid TEXT NOT NULL, sub TEXT NOT NULL,
  auth_time INTEGER NOT NULL, lease_until INTEGER NOT NULL,
  parent_expires_at INTEGER NOT NULL, idle_expires_at INTEGER NOT NULL,
  idle_timeout_seconds INTEGER NOT NULL
);
CREATE INDEX rp_session_sid ON rp_session(sid);
CREATE TABLE logout_tombstone (sid TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX logout_tombstone_expiry ON logout_tombstone(expires_at);

-- Pin identity to this RP's issuer and client. Repointing a Worker cannot reinterpret
-- old pairwise subjects, sessions or site roles as a different identity domain.
CREATE TABLE admin_instance (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  issuer TEXT NOT NULL, client_id TEXT NOT NULL, rp_origin TEXT NOT NULL
);
CREATE TRIGGER admin_instance_immutable BEFORE UPDATE ON admin_instance
BEGIN SELECT RAISE(ABORT, 'admin instance identity is immutable'); END;

CREATE TABLE site (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  artifact_namespace TEXT NOT NULL, artifact_repository TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), created_at INTEGER NOT NULL
);
CREATE TABLE site_member (
  site_id TEXT NOT NULL REFERENCES site(id), sub TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','publisher','viewer')),
  PRIMARY KEY(site_id, sub)
);
CREATE TABLE admin_operation (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id), actor_sub TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('member.set','member.remove','proposal.submit','proposal.approve')),
  payload TEXT NOT NULL, site_revision INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX admin_operation_site ON admin_operation(site_id, created_at);
CREATE TABLE proposal (
  id TEXT PRIMARY KEY REFERENCES admin_operation(id), site_id TEXT NOT NULL REFERENCES site(id),
  commit_id TEXT NOT NULL CHECK(length(commit_id) IN (40,64)), message TEXT NOT NULL,
  submitted_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','approved'))
);
CREATE TABLE publication_approval (
  id TEXT PRIMARY KEY REFERENCES admin_operation(id),
  proposal_id TEXT NOT NULL UNIQUE REFERENCES proposal(id),
  site_id TEXT NOT NULL REFERENCES site(id), commit_id TEXT NOT NULL,
  approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE INDEX proposal_site ON proposal(site_id, created_at);
-- An approval authorizes the reviewed candidate only. No provider token,
-- deployment, event consumer or autonomous publishing authority is issued here.
