/*
  # Fix Countries Access Issue

  1. Security Updates
    - Update RLS policy for countries table to allow unauthenticated access
    - Countries should be publicly readable for signup process

  2. Changes
    - Allow both authenticated and unauthenticated users to read countries
    - This is safe as countries are public reference data
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Countries are publicly readable" ON countries;

-- Create new policy that allows both authenticated and unauthenticated access
CREATE POLICY "Countries are publicly readable"
  ON countries FOR SELECT
  USING (true);

-- Also ensure the table has proper grants
GRANT SELECT ON countries TO anon;
GRANT SELECT ON countries TO authenticated;