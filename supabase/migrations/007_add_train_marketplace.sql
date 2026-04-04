-- Add train marketplace flags to the flags table
ALTER TABLE flags
  ADD COLUMN IF NOT EXISTS train_selling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS train_buying boolean NOT NULL DEFAULT false;

-- Update the category CHECK constraint on interests to allow 'train'
ALTER TABLE interests DROP CONSTRAINT IF EXISTS interests_category_check;
ALTER TABLE interests ADD CONSTRAINT interests_category_check
  CHECK (category IN ('marriage', 'island', 'company', 'train'));

-- Update the category CHECK constraint on dismissed to allow 'train'
ALTER TABLE dismissed DROP CONSTRAINT IF EXISTS dismissed_category_check;
ALTER TABLE dismissed ADD CONSTRAINT dismissed_category_check
  CHECK (category IN ('marriage', 'island', 'company', 'train'));
