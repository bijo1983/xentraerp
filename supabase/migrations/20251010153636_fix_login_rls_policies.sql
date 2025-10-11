/*
  # Fix RLS policies for login flow

  1. Changes
    - Add anonymous read access to player_users table for login flow
    - Add anonymous read access to organizer_users table for login flow
    - Add anonymous read access to admin_users table for login flow
    - Add anonymous read access to auth_user_profiles table for login flow
  
  2. Security
    - Only SELECT operations are allowed for anonymous users
    - Users can only read their own data once authenticated
    - No update, insert, or delete permissions for anonymous users
*/

-- Allow anonymous users to view player_users (needed for login flow)
CREATE POLICY "Anonymous users can view players"
  ON player_users
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view organizer_users (needed for login flow)
CREATE POLICY "Anonymous users can view organizers"
  ON organizer_users
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view auth_user_profiles (needed for login flow)
CREATE POLICY "Anonymous users can view auth profiles"
  ON auth_user_profiles
  FOR SELECT
  TO anon
  USING (true);

-- Check if admin_users table exists and add policy if it does
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'admin_users'
  ) THEN
    EXECUTE 'CREATE POLICY "Anonymous users can view admins"
      ON admin_users
      FOR SELECT
      TO anon
      USING (true)';
  END IF;
END $$;
