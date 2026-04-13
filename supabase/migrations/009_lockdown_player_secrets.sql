-- Defensive lockdown on public.player_secrets and public.secret_audit_log.
--
-- Migration 006_player_secrets.sql originally placed these tables in a
-- `private` schema and revoked access from anon/authenticated. In the
-- deployed database, however, they ended up in `public` (likely because
-- the `private` schema was not exposed to the REST API, so the tables
-- had to be moved to `public` for the edge functions — which use the
-- service_role + PostgREST — to reach them).
--
-- `public` tables are exposed through PostgREST by default, so we must
-- explicitly enable RLS (no policies = no access for anon/auth) and
-- revoke table-level privileges from anon/authenticated/PUBLIC. The
-- service_role bypasses RLS and keeps full access.
--
-- These tables hold:
--   player_secrets: AES-256-GCM ciphertext of Torn API keys + SHA-256
--                   hashes of session tokens. Neither is directly
--                   exploitable without the server-side AES key, but
--                   there is no reason to expose them via the REST API.
--   secret_audit_log: audit trail of secret operations — not sensitive
--                   per se, but should not be readable by arbitrary
--                   clients either.
--
-- Safe to run repeatedly: every statement is idempotent.

-- --- player_secrets ---
ALTER TABLE public.player_secrets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_secrets'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.player_secrets', pol.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.player_secrets FROM PUBLIC;
REVOKE ALL ON public.player_secrets FROM anon;
REVOKE ALL ON public.player_secrets FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_secrets TO service_role;

-- --- secret_audit_log (if it lives in public) ---
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'secret_audit_log'
  ) THEN
    EXECUTE 'ALTER TABLE public.secret_audit_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.secret_audit_log FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.secret_audit_log FROM anon';
    EXECUTE 'REVOKE ALL ON public.secret_audit_log FROM authenticated';
    EXECUTE 'GRANT INSERT, SELECT ON public.secret_audit_log TO service_role';
  END IF;
END $$;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'secret_audit_log'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.secret_audit_log', pol.policyname);
  END LOOP;
END $$;
