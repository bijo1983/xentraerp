/*
  # Allow Public Access to Club Information

  1. Changes
    - Add policy to allow all authenticated users to read club_users data
  
  2. Security
    - Policy is read-only (SELECT only)
    - Restricted to authenticated users
*/

DROP POLICY IF EXISTS "Anyone can view club info" ON club_users;

CREATE POLICY "Anyone can view club info"
  ON club_users FOR SELECT
  TO authenticated
  USING (true);
