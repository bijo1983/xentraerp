/*
  # Allow Public Access to Club Information

  1. Changes
    - Add policy to allow all authenticated users to read club_users data
    - This enables players to see club names and basic info when booking courts
  
  2. Security
    - Policy is read-only (SELECT only)
    - Restricted to authenticated users
    - Clubs can still only modify their own data
*/

-- Allow authenticated users to view club information
CREATE POLICY "Anyone can view club info"
  ON club_users FOR SELECT
  TO authenticated
  USING (true);
