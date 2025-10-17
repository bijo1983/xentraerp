-- Allow group registrations without selecting a club upfront
ALTER TABLE group_users
  ALTER COLUMN club_id DROP NOT NULL;

-- Preserve existing uniqueness while tolerating null club references
-- (Postgres treats NULL values as distinct in unique constraints.)
