/*
  # Fix RLS policies for login flow

  1. Changes
    - Add anonymous read access to player_users table for login flow
    - Add anonymous read access to organizer_users table for login flow
    - Add anonymous read access to admin_users table for login flow
    - Add anonymous read access to auth_user_profiles table for login flow
  
  2. Security
    - Only SELECT operations are allowed for anonymous users
*/

DROP POLICY IF EXISTS "Anonymous users can view players" ON player_users;
CREATE POLICY "Anonymous users can view players"
  ON player_users
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Anonymous users can view organizers" ON organizer_users;
CREATE POLICY "Anonymous users can view organizers"
  ON organizer_users
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Anonymous users can view auth profiles" ON auth_user_profiles;
CREATE POLICY "Anonymous users can view auth profiles"
  ON auth_user_profiles
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Anonymous users can view admins" ON admin_users;
CREATE POLICY "Anonymous users can view admins"
  ON admin_users
  FOR SELECT
  TO anon
  USING (true);
