-- Add preferred_company_types column for job seekers to filter by company type
-- Stores an array of company type IDs (1-39) that the seeker is interested in
-- NULL or empty means "show all" (no filtering)
ALTER TABLE flags ADD COLUMN IF NOT EXISTS preferred_company_types integer[];
