-- Original text is proposal data, not another identity/grant ledger.
ALTER TABLE proposal ADD COLUMN draft_digest TEXT CHECK(draft_digest IS NULL OR length(draft_digest)=64);
CREATE TABLE proposal_draft (
  proposal_id TEXT PRIMARY KEY REFERENCES proposal(id),
  digest TEXT NOT NULL CHECK(length(digest)=64),
  payload TEXT NOT NULL CHECK(length(payload)<=196608)
);
CREATE TRIGGER proposal_draft_immutable BEFORE UPDATE ON proposal_draft
BEGIN SELECT RAISE(ABORT, 'content draft is immutable'); END;
CREATE TRIGGER proposal_draft_retained BEFORE DELETE ON proposal_draft
BEGIN SELECT RAISE(ABORT, 'content draft is retained'); END;
