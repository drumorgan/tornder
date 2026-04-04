-- Secure API key storage: dedicated table in private schema with encryption fields
-- API keys are encrypted at the Edge Function layer using AES-256-GCM
-- before being stored. The DB never sees plaintext keys.

-- 0) Ensure private schema exists
CREATE SCHEMA IF NOT EXISTS private;

-- 1) Create player_secrets table in private schema
CREATE TABLE private.player_secrets (
  torn_player_id  integer PRIMARY KEY REFERENCES public.players ON DELETE CASCADE,
  api_key_enc     text,          -- base64-encoded AES-256-GCM ciphertext
  api_key_iv      text,          -- base64-encoded 12-byte nonce
  key_version     integer NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2) RLS: block ALL direct access — only service_role can touch this table
ALTER TABLE private.player_secrets ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon or authenticated roles.
-- Service role bypasses RLS.

-- 3) Explicitly revoke any grants on this table from public/anon/authenticated
REVOKE ALL ON private.player_secrets FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.player_secrets TO service_role;

-- 4) Audit log for secret operations
CREATE TABLE private.secret_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  torn_player_id  integer REFERENCES public.players ON DELETE SET NULL,
  action          text NOT NULL CHECK (action IN ('set', 'rotated', 'cleared', 'decrypt_used')),
  edge_function   text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE private.secret_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.secret_audit_log FROM anon, authenticated, public;
GRANT INSERT, SELECT ON private.secret_audit_log TO service_role;

-- 5) After migrating existing keys, drop the old plaintext column:
-- ALTER TABLE public.players DROP COLUMN IF EXISTS api_key;
-- ^^^ Uncomment and run manually after confirming migration is complete.
