-- Automated submissions have an explicit service actor, never a borrowed RP sub.
ALTER TABLE admin_operation ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'human'
  CHECK(actor_kind IN ('human','artifacts'));
CREATE TRIGGER artifacts_operation_scope BEFORE INSERT ON admin_operation
WHEN NEW.actor_kind='artifacts' AND NEW.action<>'proposal.submit'
BEGIN SELECT RAISE(ABORT, 'Artifacts can only submit proposals'); END;
ALTER TABLE proposal ADD COLUMN expected_repository_id TEXT;
CREATE TABLE artifact_push (
  proposal_id TEXT PRIMARY KEY REFERENCES proposal(id),
  site_id TEXT NOT NULL REFERENCES site(id), repository_id TEXT NOT NULL,
  ref TEXT NOT NULL, commit_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  UNIQUE(site_id,repository_id,ref,commit_id)
);
CREATE TRIGGER artifact_push_immutable BEFORE UPDATE ON artifact_push
BEGIN SELECT RAISE(ABORT, 'push receipt is immutable'); END;
