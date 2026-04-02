-- Add working stats columns to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS manual_labor integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS intelligence integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS endurance   integer;
