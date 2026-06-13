/*
  # Allow anonymous users to search for clubs

  1. Changes
    - Add policy for anon users to read club_users table
    - Add policy for anon users to read courts table
    - Add policy for anon users to read countries table
  
  2. Security
    - Only SELECT operations are allowed
*/

DROP POLICY IF EXISTS "Anonymous users can view club info" ON club_users;
CREATE POLICY "Anonymous users can view club info"
  ON club_users
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Anonymous users can view courts" ON courts;
CREATE POLICY "Anonymous users can view courts"
  ON courts
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Anonymous users can view countries" ON countries;
CREATE POLICY "Anonymous users can view countries"
  ON countries
  FOR SELECT
  TO anon
  USING (true);
