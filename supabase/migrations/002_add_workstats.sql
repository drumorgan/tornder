-- Add working stats columns to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS manual_labor integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS intelligence integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS endurance   integer;

-- Add age and last_action columns
ALTER TABLE players ADD COLUMN IF NOT EXISTS age          integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_action  timestamptz;
