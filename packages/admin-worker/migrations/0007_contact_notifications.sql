-- Operator-configured destinations stay in the private DB, never in a build.
-- Changing policy_id prevents old pending mail from going to a new destination.
CREATE TABLE contact_notification_policy (
  site_id TEXT PRIMARY KEY REFERENCES site(id),
  policy_id TEXT NOT NULL UNIQUE,
  owner_sub TEXT NOT NULL,
  from_email TEXT NOT NULL, to_email TEXT NOT NULL, admin_origin TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(site_id,owner_sub) REFERENCES site_member(site_id,sub) ON DELETE CASCADE
);
CREATE TABLE contact_notification (
  inquiry_id TEXT PRIMARY KEY REFERENCES contact_inquiry(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  error_code TEXT, message_id TEXT, sent_at INTEGER
);
CREATE INDEX contact_notification_due ON contact_notification(state,next_at,lease_until);
-- Same transaction as inquiry creation, including requests handled by older
-- Workers. No backfill: enabling notifications does not mail old inquiries.
CREATE TRIGGER contact_notification_enqueue AFTER INSERT ON contact_inquiry
BEGIN
  INSERT INTO contact_notification(inquiry_id,policy_id,next_at)
  SELECT NEW.id,p.policy_id,NEW.created_at FROM contact_notification_policy p
  WHERE p.site_id=NEW.site_id AND p.enabled=1
  AND EXISTS(SELECT 1 FROM site_member m WHERE m.site_id=p.site_id AND m.sub=p.owner_sub AND m.role='owner');
END;
