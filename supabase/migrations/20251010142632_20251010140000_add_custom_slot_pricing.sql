/*
  # Add Custom Price Support to Court Slots

  1. Changes
    - Add `custom_price` column to `court_slots` table
    - Allows clubs to override calculated peak hour pricing for individual slots
    - Nullable field - when null, uses calculated price from peak hours

  2. Notes
    - Custom prices take precedence over peak hour pricing
    - Enables fine-grained control over individual slot pricing
*/

-- Add custom_price column to court_slots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'court_slots' AND column_name = 'custom_price'
  ) THEN
    ALTER TABLE court_slots ADD COLUMN custom_price decimal(10,2) DEFAULT NULL;
  END IF;
END $$;

-- Add index for custom_price queries
CREATE INDEX IF NOT EXISTS idx_court_slots_custom_price ON court_slots(custom_price) WHERE custom_price IS NOT NULL;