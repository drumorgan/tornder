-- Secure API key storage: dedicated table with encryption fields
-- API keys are encrypted at the Edge Function layer using AES-256-GCM
-- before being stored. The DB never sees plaintext keys.

-- 1) Create player_secrets table
CREATE TABLE player_secrets (
  torn_player_id  integer PRIMARY KEY REFERENCES players ON DELETE CASCADE,
  api_key_enc     text,          -- base64-encoded AES-256-GCM ciphertext
  api_key_iv      text,          -- base64-encoded 12-byte nonce
  key_version     integer NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2) RLS: block ALL direct access — only service_role can touch this table
ALTER TABLE player_secrets ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon or authenticated roles.
-- Service role bypasses RLS.

-- 3) Explicitly revoke any grants on this table from public/anon/authenticated
REVOKE ALL ON player_secrets FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON player_secrets TO service_role;

-- 4) Audit log for secret operations
CREATE TABLE secret_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torn_player_id  integer REFERENCES players ON DELETE SET NULL,
  action          text NOT NULL CHECK (action IN ('set', 'rotated', 'cleared', 'decrypt_used')),
  edge_function   text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE secret_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON secret_audit_log FROM anon, authenticated, public;
GRANT INSERT, SELECT ON secret_audit_log TO service_role;

-- 5) Migrate existing plaintext keys → will be encrypted by a one-time Edge Function call
-- For now, mark them for migration by copying player_ids that have keys
-- The actual encryption happens at the application layer.
-- After migration is complete, drop the old column.

-- 6) Remove plaintext api_key column from players
-- NOTE: Run this AFTER you have migrated existing keys using the migrate-keys script.
-- ALTER TABLE players DROP COLUMN IF EXISTS api_key;
-- ^^^ Uncomment and run manually after confirming migration is complete.
