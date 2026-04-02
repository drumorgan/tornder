-- Add missing columns used by auth and profile flows
ALTER TABLE players ADD COLUMN IF NOT EXISTS level        integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS api_key      text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS company_type integer;
