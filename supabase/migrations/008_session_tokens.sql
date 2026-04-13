-- Session tokens for auto-login authentication.
--
-- Before this migration, `auto-login` looked up a player's encrypted API key
-- by `torn_player_id` alone. Since the client-side session is just the
-- `torn_player_id` (stored in localStorage), anyone who knew or guessed a
-- victim's Torn player ID could impersonate them.
--
-- This migration adds a server-issued bearer token that the client must
-- present alongside the player_id. We store only the SHA-256 hash of the
-- token so a DB leak does not immediately hand attackers live sessions.

ALTER TABLE private.player_secrets
  ADD COLUMN IF NOT EXISTS session_token_hash text,
  ADD COLUMN IF NOT EXISTS session_token_created_at timestamptz;

-- Lookup index for (player_id, token_hash) validation.
CREATE INDEX IF NOT EXISTS player_secrets_token_lookup
  ON private.player_secrets (torn_player_id, session_token_hash);
