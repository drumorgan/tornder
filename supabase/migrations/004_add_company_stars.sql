-- Add company_stars column to store company rating (1-10 stars)
ALTER TABLE players ADD COLUMN IF NOT EXISTS company_stars integer;
